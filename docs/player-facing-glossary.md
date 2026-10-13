# Player-facing game glossary

Use these terms in visible game text, incoming messages, broadcasts, rules, recaps, and player-facing help:

| Use                                | Meaning                                                                                             |
| ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Hub**                            | The shared social game space.                                                                       |
| **Hubmate**                        | A player in the Hub.                                                                                |
| **Leader of the Hub** or **LOH**   | The player who leads the Hub for the current cycle. Both forms are valid.                           |
| **Power of Safety** or **Safety**  | The competition power that can protect a nominee and open a replacement spot. Both forms are valid. |
| **Nominee**                        | A player named for possible elimination.                                                            |
| **Replacement target**             | The player under consideration to fill a spot opened by a Safety decision.                          |
| **Elimination** / **eliminated**   | The vote or other game outcome that ends a player's active season.                                  |
| **Tribunal** / **Tribunal member** | The season's final voting group and one of its members.                                             |
| **Personal pact**                  | A private two-person commitment; keep it distinct from a group alliance.                            |
| **Alliance**                       | An official group commitment.                                                                       |

Avoid format-specific terms such as _houseguest_, _backdoor_, _eviction_, _Power of Veto_, and _jury_ in visible game copy. Use the glossary term that describes the actual mechanic; do not mechanically substitute words where the sentence means something else.

The full role names are intentional, not errors. **LOH** and **Safety** are acceptable short forms where the interface needs compact copy.

Keep persisted state names, action types, event identifiers, and compatibility aliases stable unless a separate data migration is planned. For example, legacy fields or internal keys may still contain terms such as `evicted`, `eviction`, `jury`, or `backdoor`; those are implementation details and should not appear directly in player-facing copy.
