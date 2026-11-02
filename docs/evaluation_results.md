# Evaluation results

- Embedding provider: **minilm**
- Test set: 56 hand-written tickets (48 real problems, 8 that should go to triage), separate from the seed tickets
- Thresholds tuned on the even-numbered half (28 tickets), reported on the held-out odd-numbered half (28 tickets)
- Chosen thresholds: HIGH (suggest) = 0.4, MID (route) = 0.35
- Searchable corpus: 101 verified resolved tickets

| Metric | Embedding search (held-out) | Keyword baseline (held-out) | Embedding search (tuning half) | Embedding search (all) |
|---|---|---|---|---|
| Decision accuracy | 96.4% | 78.6% | 96.4% | 96.4% |
| Department accuracy among routed tickets | 100.0% | 87.0% | 100.0% | 100.0% |
| Coverage (real problems not sent to triage) | 100.0% | 95.8% | 100.0% | 100.0% |
| Triage recall (out-of-scope tickets caught) | 75.0% | 50.0% | 75.0% | 75.0% |
| Share of tickets answered with a suggested fix | 89.3% | n/a | 89.3% | 89.3% |

Decision accuracy counts a ticket as correct when a real problem is routed to the right department, or an out-of-scope ticket is sent to triage.

## Threshold sweep (tuning half, top 8 of 122)

| HIGH | MID | Decision accuracy | Department accuracy | Coverage |
|---|---|---|---|---|
| 0.4 | 0.35 | 96.4% | 100.0% | 100.0% |
| 0.4 | 0.4 | 96.4% | 100.0% | 100.0% |
| 0.45 | 0.35 | 96.4% | 100.0% | 100.0% |
| 0.45 | 0.4 | 96.4% | 100.0% | 100.0% |
| 0.45 | 0.45 | 96.4% | 100.0% | 100.0% |
| 0.5 | 0.35 | 96.4% | 100.0% | 100.0% |
| 0.5 | 0.4 | 96.4% | 100.0% | 100.0% |
| 0.5 | 0.45 | 96.4% | 100.0% | 100.0% |

## Mistakes on the held-out half

- "Something is not working": expected triage, got Facilities Electrical (suggest, best similarity 0.54)
