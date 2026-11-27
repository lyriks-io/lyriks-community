# Score vocabulary

One name per number a page shows, used the same way in the pages, the docs, the
API answers and the MCP descriptions. Do not invent synonyms.

The Overview's measures:

| Name | Meaning |
|---|---|
| **Features** | How many features the product has, in how many core features. This is a count of leaf features: label it "Features", never "Components", which names the Experience section's reusable UI blocks. |
| **Users** | How many profiles use the product, end users and admins. |
| **Health** | One score out of 100 with its word (Strong, To watch, Critical), computed from every point listed in Health: the coherence of the specification, what the completeness audit flags and, once code is linked, what the code says about it. A defect of the product weighs most, then a gap in the description, then an open question; what Lyriks could not check counts nothing. Pointing at the figure says what it weighs now. |
| **Noticed** | The points still waiting, major and minor. Every one of them is listed in Health. |
| **In the code** | After a Reverse-Specification, how much of the specification was found in the code and how much cites its source. |

Read them together: a high health on a specification nobody validated yet still
waits for people.

## No bare score

A score is never shown alone: Health always comes with its word and with the
points that weigh on it, by type, the heaviest first (a contradiction, a gap, an
open question), each saying where to fix it. "Critical" is reserved for
something blocking or of high severity.

There is no Control Center and no page of scores of its own: every problem
Lyriks knows is a point of the Health page, and an old link to the former
health page opens it.
