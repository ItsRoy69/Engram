# Wiring the new UI components

All polished components are already on `main`:

- MemoryCard
- EmptyState
- GraphView
- LoadingSkeleton
- PromptStarter
- StatusBadge

## Required changes in `src/app/page.tsx`

### 1. Imports
```tsx
import MemoryCard from "@/components/MemoryCard";
import EmptyState from "@/components/EmptyState";
import GraphView from "@/components/GraphView";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import PromptStarter from "@/components/PromptStarter";
import StatusBadge from "@/components/StatusBadge";
```

### 2. Vault empty / loading
Replace the block that starts with `{!loadingMem && filteredMems.length === 0 && (` with the LoadingSkeleton + EmptyState version.

### 3. Graph
Replace `<KnowledgeGraphView ... />` with:
```tsx
<GraphView
  memories={filteredMems}
  onOpen={openLineage}
  stats={healthData?.graph}
  online={online}
  model={healthData?.model}
/>
```

### 4. Prompt starters
Use `<PromptStarter ... />` for the empty chat state.

### 5. Header status
Use `<StatusBadge online={online} model={healthData?.model} />`.
