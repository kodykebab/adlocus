## Do analytics *fully off-chain* (no contract changes)

Use events + logs → derive everything.

---

# 1. What you listen to

From your contract:

* MatchResult(user, advertiserId)
* recordImpression() tx (or payout tx)

That’s enough.

---

# 2. Backend indexer (core)

Run a listener:

js
provider.on("MatchResult", (user, advertiserId, event) => {
  db.insert({
    type: "match",
    advertiserId,
    user,
    txHash: event.transactionHash,
    timestamp: Date.now()
  });
});


Also track payouts:

js
provider.on("Transfer", (from, to, amount) => {
  // filter contract → user transfers
});


---

# 3. Build raw tables

### Matches

json id="qj5n3h"
{
  "advertiserId": 1,
  "timestamp": 1710000000
}


---

### Impressions / payouts

json id="7c1s9a"
{
  "advertiserId": 1,
  "amount": 10,
  "timestamp": 1710000100
}


---

# 4. Metrics you can compute

## 1. Spend rate (budget burn)

text id="9l3j7s"
spend_per_min = total_spend / time_window


→ “losing budget fast or slow”

---

## 2. Impressions per minute

text id="g2w6xp"
impressions / time


---

## 3. Avg payout frequency

text id="j1k4dt"
avg_time_between_payouts


---

## 4. Win rate

text id="0p7f4n"
wins / matches_seen


(approx using MatchResult counts)

---

## 5. Estimated remaining budget

If initial budget known:

text id="e7s4mb"
remaining = initial - total_spend


---

## 6. Competitiveness score

text id="v8c2yt"
avg(value) vs others


(derived from frequency of wins)

---

# 5. API for advertisers

http
GET /analytics?advertiserId=1


Return:

json id="y2xq9r"
{
  "impressions": 120,
  "totalSpend": 1500,
  "spendRate": 25,
  "avgPayoutInterval": "30s",
  "winRate": 0.42,
  "remainingBudget": 3500
}


---

# 6. Optional (better insights)

### Time-series

* spend over time
* impressions over time

---

### Site-level breakdown

(only if SDK sends site info)

json id="n6k3pw"
site → impressions


---

### Click tracking

Wrap links:

text id="r3d8vm"
/click?ad=1


→ track CTR

---

# 7. Key trick

You don’t need:

* user data
* decrypted vectors
* contract changes

Everything comes from:

> *event frequency + token transfers*

---

## One line

Analytics =
*listen to on-chain events, store timestamps, and derive spend rate, win rate, and payout frequency off-chain.*