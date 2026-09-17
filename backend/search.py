"""
Engram — Hybrid Search
Combines dense vector search + BM25Okapi keyword search.
Merges results via Reciprocal Rank Fusion (RRF).
"""
import re
import hashlib
import numpy as np
from functools import lru_cache
from rank_bm25 import BM25Okapi
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Filter, FieldCondition, MatchValue,
    SparseVector, OrderBy, Direction,
)
from db import get_qdrant
from embedder import embedder
from config import get_settings

settings = get_settings()

SPARSE_FIELD = "text_sparse"

def tokenize(text: str) -> list[str]:
    """
    Deterministic tokeniser shared by storage (memory.py) and search.

    • Lowercases
    • Strips punctuation (keeps word characters and whitespace)
    • Splits on whitespace
    • Filters empty tokens

    Deterministic: no hash randomisation, no process-local state.
    Consistent results on every Python version and restart.
    """
    text = text.lower()
    text = re.sub(r"[^\w\s]", " ", text)
    return [t for t in text.split() if t]

def tokens_to_sparse_vector(tokens: list[str]) -> SparseVector:
    """
    Convert a token list -> Qdrant SparseVector for storage.

    Uses MD5 (truncated to 31 bits) instead of hash() so the same
    token always maps to the same index across all processes, workers,
    and restarts. TF-normalised weights only — IDF is handled by
    BM25Okapi at query time and by Qdrant's BM42 at storage time.
    """
    tf: dict[int, float] = {}
    for token in tokens:
        idx = int(hashlib.md5(token.encode()).hexdigest(), 16) % (2 ** 31)
        tf[idx] = tf.get(idx, 0.0) + 1.0
    total = sum(tf.values()) or 1.0
    return SparseVector(
        indices=list(tf.keys()),
        values=[v / total for v in tf.values()],
    )

def _vector_search(query: str, user_id: str, top_k: int) -> list[dict]:
    """Dense cosine-similarity search via Qdrant."""
    client = get_qdrant()
    query_vector = embedder.embed(query)

    resp = client.query_points(
        collection_name=settings.qdrant_collection,
        query=query_vector,
        query_filter=Filter(must=[
            FieldCondition(key="user_id", match=MatchValue(value=user_id)),
            FieldCondition(key="is_latest", match=MatchValue(value=True)),
            FieldCondition(key="is_valid",  match=MatchValue(value=True)),
        ]),
        limit=top_k,
        with_payload=True,
    )
    results = resp.points

    return [
        {
            "id":           str(r.id),
            "content":      r.payload["content"],
            "tags":         r.payload.get("tags", []),
            "created_at":   r.payload.get("created_at", ""),
            "vector_score": round(r.score, 4),
        }
        for r in results
    ]

def _fetch_corpus(user_id: str) -> tuple[list[str], list[dict]]:
    """
    Scroll up to `bm25_max_corpus` of the most recent valid memories for
    this user from Qdrant, newest-first.

    Bounded scroll (not a full corpus scan) so BM25 cost stays flat as the
    user's memory grows. Returns (contents, doc_metadata_list).

    Payload-only scroll (with_vectors=False) — only text payloads transfer.
    """
    client = get_qdrant()

    existing = [c.name for c in client.get_collections().collections]
    if settings.qdrant_collection not in existing:
        return [], []

    all_docs: list[dict] = []
    offset = None
    max_docs = settings.bm25_max_corpus

    try:
        order_by = OrderBy(key="created_at", direction=Direction.DESC)
    except Exception:
        order_by = None

    while len(all_docs) < max_docs:
        results, next_offset = client.scroll(
            collection_name=settings.qdrant_collection,
            scroll_filter=Filter(must=[
                FieldCondition(key="user_id", match=MatchValue(value=user_id)),
                FieldCondition(key="is_latest", match=MatchValue(value=True)),
                FieldCondition(key="is_valid",  match=MatchValue(value=True)),
            ]),
            limit=min(1000, max_docs - len(all_docs)),
            offset=offset,
            order_by=order_by,
            with_payload=True,
            with_vectors=False,
        )
        for r in results:
            all_docs.append({
                "id":         str(r.id),
                "content":    r.payload["content"],
                "tags":       r.payload.get("tags", []),
                "created_at": r.payload.get("created_at", ""),
            })
        if next_offset is None:
            break
        offset = next_offset

    contents = [d["content"] for d in all_docs]
    return contents, all_docs

@lru_cache(maxsize=32)
def _get_bm25_index(user_id: str) -> tuple[list[str], list[dict], BM25Okapi | None]:
    """
    Fetch + tokenise + build the BM25Okapi index for one user, memoised.

    Building the index is the expensive part of keyword search: a bounded
    Qdrant scroll, tokenisation of every document, and BM25 corpus stats.
    Memoising per user means repeated queries reuse one in-memory index
    instead of doing all of that on every call.

    Memory is bounded by lru_cache(maxsize=32) — at most 32 users' indexes
    are retained; the least-recently-used is evicted. lru_cache is
    thread-safe in CPython, so no extra locking is needed.

    Correctness: call invalidate_bm25_cache() whenever a user's set of
    valid/latest memories changes (store, delete, supersession).
    """
    contents, all_docs = _fetch_corpus(user_id)
    tokenized_corpus = [tokenize(c) for c in contents]
    bm25 = BM25Okapi(tokenized_corpus) if tokenized_corpus else None
    return contents, all_docs, bm25

def invalidate_bm25_cache() -> None:
    """
    Drop every cached BM25 index.

    Called after any write that changes a user's valid/latest memory set
    (store, delete, supersession) so the next query rebuilds from Qdrant.

    Clearing all users rather than one is deliberate: writes are far rarer
    than reads, and it keeps every write path correct without having to
    thread user_id through it.
    """
    _get_bm25_index.cache_clear()

def _bm25_search(query: str, user_id: str, top_k: int) -> list[dict]:
    """
    BM25Okapi keyword search with true IDF weighting over a bounded corpus.

    How it works:
      1. Get the user's BM25 index — fetched and built on first use, then
         reused across queries until invalidate_bm25_cache() is called.
         The underlying corpus is up to `bm25_max_corpus` of the user's
         most recent memories from Qdrant (capped, newest-first).
      2. Score the query — rare terms score exponentially higher than
         common ones, unlike the old TF-only sparse vectors.
      3. Return top_k results ordered by descending BM25 score.

    Graceful fallbacks:
      • Empty corpus     -> returns []  (silent)
      • Zero query score -> skips entry (only real keyword hits returned)
      • Any exception    -> returns []  and logs the error
    """
    try:
        contents, all_docs, bm25 = _get_bm25_index(user_id)
    except Exception as e:
        print(f"[Engram] BM25 corpus fetch failed (non-critical): {e}")
        return []

    if not contents or bm25 is None:
        return []

    query_tokens = tokenize(query)
    if not query_tokens:
        return []

    scores = bm25.get_scores(query_tokens)

    top_indices = np.argsort(scores)[::-1][:top_k]
    results = []
    for idx in top_indices:
        score = float(scores[idx])
        if score <= 0.0:
            continue
        results.append({
            **all_docs[idx],
            "bm25_score": round(score, 4),
        })

    if results:
        print(
            f"[Engram] BM25: {len(results)} keyword hit(s) | "
            f"corpus={len(contents)} | top={results[0]['bm25_score']:.4f}"
        )
    else:
        print(f"[Engram] BM25: no keyword matches (corpus={len(contents)})")

    return results

def _rrf_merge(
    vector_results: list[dict],
    bm25_results:   list[dict],
    k: int = 60,
) -> list[dict]:
    """
    Reciprocal Rank Fusion (Robertson et al.) — merges two ranked lists.

    score(d) = sum of  1 / (k + rank_i(d))  over both lists.

    k=60 is the standard constant. Works correctly when either list is
    empty — the other list's scores dominate, giving graceful fallback.
    """
    scores:    dict[str, float] = {}
    all_items: dict[str, dict]  = {}

    for rank, item in enumerate(vector_results):
        mid = item["id"]
        scores[mid]    = scores.get(mid, 0.0) + 1.0 / (k + rank + 1)
        all_items[mid] = item

    for rank, item in enumerate(bm25_results):
        mid = item["id"]
        scores[mid]    = scores.get(mid, 0.0) + 1.0 / (k + rank + 1)
        all_items[mid] = item

    sorted_ids = sorted(scores, key=lambda x: scores[x], reverse=True)

    return [
        {**all_items[mid], "rrf_score": round(scores[mid], 6)}
        for mid in sorted_ids
    ]

def hybrid_search(query: str, user_id: str = "default", top_k: int = None) -> list[dict]:
    """
    Full hybrid search pipeline.

      dense vector  --.
                      +--> RRF merge --> top_k results
      BM25Okapi    --'

    Falls back to vector-only gracefully if BM25 returns nothing
    (empty corpus, all-zero scores, fetch error).
    """
    if top_k is None:
        top_k = settings.top_k_retrieval

    vector_results = _vector_search(query, user_id, top_k)
    bm25_results   = _bm25_search(query, user_id, top_k)
    merged         = _rrf_merge(vector_results, bm25_results)

    return merged[:top_k]
