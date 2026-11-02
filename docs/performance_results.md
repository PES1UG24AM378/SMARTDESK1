# Performance results (generated data)

## 1. B-tree indexes on 2,00,000 generated tickets

| Query | Without index | With index | Plan with index |
|---|---|---|---|
| Last 20 open tickets (status filter, newest first) | 9.43 ms (->  Sort) | 0.06 ms | ->  Index Scan using perf_idx_status_created on perf_tickets |
| One employee's recent tickets | 6.69 ms (->  Sort) | 0.05 ms | ->  Index Scan using perf_idx_user_created on perf_tickets |
| High priority tickets in one department | 8.21 ms (->  Parallel Seq Scan on perf_tickets) | 1.71 ms | ->  Bitmap Heap Scan on perf_tickets |

## 2. HNSW vector index on 20,000 generated 384-dimension vectors (50 clusters, like real text embeddings)

| Search | Time (one query) | Plan |
|---|---|---|
| Exact (no index) | 11.92 ms | ->  Sort |
| HNSW index | 0.81 ms | ->  Index Scan using perf_hnsw on perf_vectors |

Index build time: 2.2 s. Average recall@5 over 20 queries: 54% (the share of the exact 5 nearest neighbours that HNSW also returned).

Note: with only about 100 real tickets the planner correctly prefers an exact scan. The HNSW index pays off as the corpus grows. HNSW is approximate by design, and recall is lower on synthetic data where many neighbours are almost equally close; raising hnsw.ef_search trades speed for recall.
