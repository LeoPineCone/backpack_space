# Store and purchases

Concept only (decided 2026-11-17). Nothing here is built.

All purchases run through RevenueCat, first for real money, then with Credits. Both are finished before launch. How the app, the backend and RevenueCat talk to each other is drawn in [client-server.md](client-server.md).

## Decisions

- **Service:** RevenueCat checks purchases and refunds with Apple and Google. We build no store integration of our own.
- **Build order:** stage 1 is purchases for real money, stage 2 is Credits. At launch both exist.
- **Credits balance:** lives at RevenueCat only. Our server does not store it. Reason: we do not want to manage a resource ourselves that real money flows into.
- **Ownership:** what a player owns (skins, pass, heroes) is stored by our server.
- **Refund:** what is refunded is taken back.
- **Many refunds:** no account ban at launch. A ban stays an idea in case such accounts show up and cause a lot of work.

## What is sold

Only two kinds of things cost real money: the premium pass and Credit packs (decided 2026-11-17). Everything else costs Credits and is an entry in `data/meta.json`.

| Product | Paid with | Store entry | Stage |
| --- | --- | --- | --- |
| Premium pass of a season | real money | one product per season, one-time purchase, no subscription | 1 |
| Credit packs | real money | a few packs, created once | 2 |
| Skins, backgrounds, grid backgrounds | Credits | none | 2 |
| Heroes of earlier seasons | Credits | none | 2 |

Every real-money product has to be created at Apple and Google one by one, and Apple reviews new products before they can be sold. A skin or a hero for Credits needs no store entry and no app update.

## Stage 1: purchase for real money

The server unlocks, the app only shows. The app alone cannot create ownership.

1. The app signs the player in at RevenueCat with our own player id. That is the random number under which our server keeps the player, not a store id and not a name.
2. The player taps Buy, sees preview and confirmation and pays through the store.
3. RevenueCat checks the receipt with Apple or Google.
4. RevenueCat reports the purchase to our server by webhook. The webhook carries a secret header.
5. The server checks whether it has already handled this report. If not, it enters the ownership in the profile.
6. The app loads the profile again and shows the pass.

If the webhook arrives later than the app asks, the app shows "Confirming purchase" for a moment and asks again. If the webhook stays away, the server asks RevenueCat for the purchase itself.

## Stage 2: Credits

The balance lives at RevenueCat, every movement runs through our server. The app can read the balance but cannot book anything.

| Action | Who books | How |
| --- | --- | --- |
| Buy a Credit pack | RevenueCat | purchase as in stage 1, RevenueCat credits the Credits itself |
| Buy with Credits | our server | first deduct at RevenueCat, then enter the ownership |
| Earn Credits (pass, planet track) | our server | credit at RevenueCat with a unique id of the reward |
| Refund of a pack | RevenueCat | deducts the Credits of the pack, down to 0 at most |

Rules for spending:

- **Order:** always deduct first, then unlock. If unlocking fails, the server repeats it until it works. So there is never a skin without a deduction.
- **Id per booking:** every booking carries a unique id (for example player + skin, or player + pass tier). A repeated request then does not book twice.
- **Balance too low:** RevenueCat declines, the server reports that to the app, nothing changes.

## Ownership and prices in the data

Ownership is stored separately from the way it was paid for, so that Credits are just one more way to the same unlock.

- **Ownership in the profile:** "player owns skin X", plus the origin: real-money purchase, Credits, pass tier (free or premium, which season), hero level or planet track.
- **Why the origin:** after a refund the server knows exactly what to take back. Without it a refunded premium pass could not be undone cleanly.
- **Price per cosmetic in `data/meta.json`:** one field with kind and value, either store product or Credits. Shop screen and purchase popup read only this field.
- **Credits rewards** in the pass and the planet track stay in the data as they are.

## Refunds

The store decides about a refund, not we. Our part is to take back what was refunded.

- **Apple:** the player asks Apple, Apple decides alone. Apple asks beforehand whether the purchase was already consumed. That answer should be given automatically (check when setting up RevenueCat).
- **Google:** in the first 48 hours Google decides. After that the request lands with us in the Play Console.
- **Report:** RevenueCat reports every refund to our server by webhook.

What the server does after a refund:

| Refunded | The server takes back |
| --- | --- |
| Premium pass | premium for that season and all rewards of the premium lane, including the season hero. Credits from the premium lane are deducted at RevenueCat. |
| Credit pack, Credits still there | nothing, RevenueCat deducts the Credits itself. |
| Credit pack, Credits already spent | proposal, not decided: the things bought with Credits most recently, until the missing amount is covered. RevenueCat knows no negative balance, so the server would even it out this way. If a skin that is taken back was equipped, the default skin is set. |

At the next start the player sees a short note about what was taken back and why.

## Accounts with many refunds

There is no ban at launch (decided 2026-11-17). Every refund is only taken back as described above.

The server still counts refunds per account from the start. That costs nothing and shows later whether the problem exists at all.

**Idea for later**, in case single accounts refund often and cause a lot of work: a ban from x refunds within a period, for example 3 in 12 months with a warning at the second. For that the rule would have to be in the terms of use, there would have to be a way to appeal, and it should be checked legally.

## What RevenueCat can and cannot do

Checked on 2026-11-17 through web search only. The documentation pages themselves were not reachable from the work environment, so check again in a sandbox project before building.

| Point | State |
| --- | --- |
| Currency feature available | Yes, for all customers. Called [In-App Currency](https://www.revenuecat.com/docs/offerings/virtual-currency) in the documentation, announced in [August 2025](https://www.revenuecat.com/blog/company/revenuecat-virtual-currency). |
| Deduct and credit from the server | Yes, through the Developer API v2 with positive or negative amounts. |
| Balance check when deducting | Yes, RevenueCat checks and only deducts if it is enough ([Balance Source of Truth](https://www.revenuecat.com/docs/offerings/virtual-currency/faq/balance-source-of-truth)). |
| Protection against double booking | Yes, through an id per request. |
| Read the balance in the app | Yes, Capacitor plugin from version 11.1.0. |
| Negative balance | No. After a [refund](https://www.revenuecat.com/docs/offerings/virtual-currency/refunds) the deduction ends at 0. |
| Partial refund at Google | Not detected, only full refunds change the balance. |
| Report for bookings through the API | No, our own bookings trigger no webhook ([Events](https://www.revenuecat.com/docs/offerings/virtual-currency/events)). |
| Request limits of the API | Not checked. |
| Error message when the balance is too low | Not checked. |
| Local development | Not checked. RevenueCat is said to offer a test store for development that needs no real store. |
| Cost | As far as known free up to about 2,500 dollars revenue a month, about 1 percent after that. Check on the pricing page. |

## Law and store rules

These points are a technical assessment and not legal advice. Someone qualified should check them before launch.

- **Right of withdrawal in the EU:** digital content has 14 days of withdrawal. It ends when the buyer agrees to the immediate start. Apple and Google collect that consent as the sellers.
- **Real-money price next to Credits:** the EU consumer protection authorities published principles on in-game currencies in 2025 that ask for this. Decided 2026-11-17: we do not show it; a thing costs either real money or Credits. Whether that is enough is part of the legal check before launch.
- **Terms of use:** taking things back after a refund has to be stated there.
- **Privacy:** RevenueCat goes into the privacy policy as a processor. Only our player id is passed on, no name and no e-mail.
- **Restore purchases:** around purchases and refunds only what the stores require is built, no conveniences. Apple asks for a visible way to restore purchases, so the iOS release needs one (a button in the settings that reloads the profile from the server is enough). An Android launch does not.
- **Account deletion:** purchase data is kept separately from the game profile because of legal retention periods.
- **Prices:** the price of the pass, the Credit packs and the Credits prices are still to be set for the things version 1 starts with.

## Open questions

- Which Credit packs exist, and what do they cost?
- What does the premium pass cost, and how long is a season?
- Can the premium pass also be bought with Credits?
- What does a hero of an earlier season cost in Credits?
- Does a player get refunded pass rewards back when buying the pass again in the same season?
- How does the server close the gap when refunded Credits are already spent?
