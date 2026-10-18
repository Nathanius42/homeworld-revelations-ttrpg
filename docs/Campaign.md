# Campaign

A campaign carries a crew from one game night to the next: the same characters, their kit, their wounds and scars, the Requisition they earned and the story so far.

![Between missions: the advance and the requisition list](images/screens/20-between-missions.png)

## How it plays

1. **Finish a mission.** It becomes a chapter of the campaign: how it ended, the RU earned, who was there and any scars earned. Every crew member who took part earns an **advance**.
2. **Continue the campaign** on the debrief (anyone can press it). A new table starts with the same crew, and every phone and the TV move across by themselves. Players keep their seats and characters, and kit is kept (anything lost or broken stays behind). Stress clears, but wounds may not (see below).
3. **Between missions**, in the lobby:
   - **Spend the advance:** +1 to a skill (up to 5), or a new focus.
   - **Requisition kit** with the RU banked: a medkit, breaching charges, a repair kit, a scanner, a climbing rig or a rifle. Kit makes a fitting test one step easier when it's used, and it has to fit the character's load (no hammerspace).
   - **The infirmary** treats a wound carried over from the last mission, for 1 RU.
   - **The story so far** heads "Before you begin": one line per chapter.
4. **Begin the mission.** The Narrator opens with "Previously, aboard …", the last chapter's ending and who still carries its scars. Anyone still wounded is named in the log.

The next mission is the last one's `sequel` if it names one; otherwise it's the first mission the crew hasn't played yet. Players can still pick another in the lobby.

## Wounds and scars

- **Lasting wound.** Anyone injured during a mission starts the next one with one injury, unless the infirmary treats it first. One more injury takes them down, so a wounded crew member is worth protecting, or worth 1 RU.
- **Scar.** Anyone taken down during a mission (two injuries or more) also comes out of it with a scar: a burn along the jaw, a reconstructed hand, a ringing ear. Scars never heal. They're story, not a penalty. They appear in the personnel file and between missions, the recap names who carries them, and the Claude GM is told to weave them in now and then.

Scars come from a fixed list (`SCARS` in `campaign.ts`). They're picked by character and chapter, so the same game always gives the same scar, and nobody gets the same scar twice while others are left.

## Picking up an older campaign

A campaign doesn't have to carry on from the debrief. On the laptop, the **host console** lists saved campaigns under **Campaigns**, and so does the title page under **Or carry on a campaign**. Each shows its ship, chapters and crew.

- If the latest chapter is still in the lobby or under way, **Resume** opens that table.
- If the latest chapter finished, **Start the next chapter** does what *Continue the campaign* would have done.

Either way, the TV follows. Every table in a campaign carries the campaign's id, so the list shows each campaign once, by its latest chapter's table. A chapter that has been continued is skipped even if it was saved later.

## Where to look

| Piece | Code |
| --- | --- |
| Chapters, scars, carrying the crew over, the next mission, the recap | `apps/server/src/campaign.ts` |
| Recording a chapter at the end; the recap at the start; spending advances and RU; the infirmary; marking who was hurt or downed | `apps/server/src/engine.ts` (`spendAdvance`, `requisition`, `treatWound`, `damagePc`) |
| Starting the next table and pointing the old one at it (`nextTable`) | `Hub.continueCampaign`, `POST /api/tables {continueFrom}` |
| The list of saved campaigns and reopening one | `Store.campaigns`, `Hub.reopenCampaign`, `GET /api/campaigns`, `POST /api/campaigns/reopen` |
| The requisition list | `packages/content/src/requisition.ts`, `/api/requisition` |
| Following to the next table with the same seat | `moveSeat` in `apps/web/src/store.ts`, `TableRoute` in `App.tsx` |
| The lobby panels | `BetweenMissions.tsx`, `BeforeYouBegin.tsx` |
| The campaign lists | `HostConsole.tsx`, `Title.tsx` |

Tests: `apps/server/test/campaign.test.ts`, and the Cold Harbour e2e test, which continues into the next mission after the debrief.

## Not yet

- Spending RU on the ship rather than on personal kit.
