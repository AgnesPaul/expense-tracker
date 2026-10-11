# AWS Learning Notes

Running reference for the expense-tracker AWS project. Concepts, not clicks —
console UIs change, these ideas don't. Grows one section per phase.

**Account:** AWS Free plan (new Builder Experience) · **Region:** `ap-southeast-2` (Sydney)

---

# Phase 0 — Account & billing model

## The account model changed in September 2026

AWS launched the **Builder Experience** on 16 Sept 2026. Accounts created after
that date work differently from every tutorial written before it:

| | Classic AWS | New Builder Experience |
|---|---|---|
| Sign-in | Root user (email + password) | Builder ID / Google / GitHub / Apple |
| First thing created | Nothing | A **project**, automatically |
| Identity for humans | IAM users you create | Email invites; no IAM users |
| Regions | All of them | **One**, pinned, selector hidden |
| MFA | On the root user | On the Builder ID / social login |

If a tutorial tells you to "sign in as root and enable MFA", it predates this.
Not wrong — just describing a console you don't have.

## Free plan vs Paid plan

| | Free plan | Paid plan |
|---|---|---|
| Credits | $100 at signup, +$100 earnable | Same |
| Can you be charged? | **No. Ever.** | Yes, past the credits |
| Ends when | 6 months, or credits exhausted | Doesn't |
| Then what | Account **auto-closes** (90-day grace) | Keeps billing |

For a disposable learning project the auto-close is a safety net, not a risk.

## ⚠️ The one-way door

**Never "activate advanced features."** It is irreversible, pulls the account
into AWS Organizations, and *joining an Organization auto-upgrades Free → Paid*.
You'd trade "cannot be charged" for pay-as-you-go against a real card.

Same applies to: AWS Control Tower, AWS Partner Network, Enterprise Agreements.

Confirmed available **without** activating: IAM **roles**, VPC, EC2, RDS,
Budgets. That covers everything this project needs.

The cost is being single-region. Harmless — every region has multiple
Availability Zones, which is all any of this design requires.

## Budgets: unblended vs net

AWS Budgets' **"Aggregate costs by"** setting decides what you see:

- **Unblended costs** — gross usage, *before* credits. ← what you want
- **Net unblended costs** — after credits are subtracted

On "net", your budget reads **$0.00** no matter how much you use, right up until
the credits vanish and the account closes with no warning. Always budget on
unblended so you can see how fast you're burning through credits.

> The old advice to "untick Credits in cost types" refers to a checkbox AWS
> moved. The aggregation dropdown does the same job.

## No CloudWatch billing alarm

The `EstimatedCharges` metric exists **only in `us-east-1`**, regardless of
where your resources run. Single-region accounts can't reach it. AWS Budgets
is account-wide and covers the same ground.

## India-specific: AISPL

An Indian billing address contracts you with **AISPL** (AWS's Indian entity),
not AWS Inc. Consequences: INR billing with 18% GST, and mandatory CERT-In
identity verification at signup. Accepted documents are **PAN card**, Voter ID,
Driving Licence, or Passport — Aadhaar is not a standalone accepted document.

---

# Phase 2 — VPC networking

## The problem a VPC solves

Before VPCs, every EC2 instance sat on one shared flat network — your server
and a stranger's were neighbours. A **VPC is your own isolated network inside
AWS**, effectively a virtual data centre: you choose the IP range, how it's
divided, and what can reach what.

## CIDR notation

An IPv4 address is 32 bits. The `/n` says **the first n bits are fixed**.

```
10.0.0.0/16   →  10.0.xxx.xxx     65,536 addresses   the whole estate
10.0.1.0/24   →  10.0.1.xxx          256 addresses   one street
```

Bigger number = smaller block.

**Why `10.x`?** Three ranges are reserved as private and are not routable on the
public internet — `10.x.x.x`, `172.16–31.x.x`, `192.168.x.x`. Your home router
hands out `192.168.1.x` for the same reason.

**AWS reserves 5 addresses per subnet** (network, VPC router, DNS, reserved,
broadcast). A `/24` gives 251 usable, not 256.

## Subnets — two unrelated reasons to divide

Conflating these is the usual source of confusion.

**1. Availability Zones = survival.** An AZ is a *physically separate data
centre* — separate power and cooling, linked by private fibre. **A subnet lives
in exactly one AZ and cannot span two.** So surviving one data centre failure
requires subnets in two AZs.

Not theoretical: an **ALB refuses to be created** with fewer than two AZs, and
so does an **RDS subnet group**.

**2. Public vs private = security.** Separating them lets you apply different
*routing* to each — which is the entire mechanism, as below.

Our layout is a 2×2 grid:

```
            ap-southeast-2a      ap-southeast-2b
public   │  10.0.1.0/24       │  10.0.2.0/24     │  ← reachable from internet
db       │  10.0.21.0/24      │  10.0.22.0/24    │  ← reachable from nothing
```

## Route tables — the actual mechanism

**The single most important concept in Phase 2.**

A route table is a lookup list every outbound packet consults. Each subnet is
associated with exactly one. **The most specific match wins.**

Private table — one entry, created automatically:

| Destination | Target |
|---|---|
| `10.0.0.0/16` | local |

*"Anything inside this VPC, deliver internally."* Everything else matches
nothing, so **the packet is dropped**. No internet out, no internet in.

Public table — one extra line:

| Destination | Target |
|---|---|
| `10.0.0.0/16` | local |
| `0.0.0.0/0` | `expense-igw` |

`0.0.0.0/0` means *any address* — the least specific match possible. So internal
traffic still goes local (more specific wins) and everything else goes out.

> **The sentence to remember:** a subnet is public or private *entirely* because
> of that one route. There is no public/private setting in AWS. Plenty of people
> with years of AWS experience don't know this.

## Internet Gateway — and why attaching isn't enough

The IGW does two jobs:

1. **A target** routes can point at — the door out
2. **1:1 NAT** between an instance's private address and its public one

That second job surprises people. SSH into an EC2 instance with a public IP and
run `ip addr` — you'll see only `10.0.1.x`. **The instance never knows it has a
public IP.** It exists only in AWS's network layer.

Note the sequencing:

- Create the IGW → nothing happens
- Attach it to the VPC → still nothing
- Add the `0.0.0.0/0` route → **now traffic flows**

A gateway with no route pointing at it is an unused door. "I attached an
internet gateway but still have no internet" is among the most-asked AWS
questions ever, and this is why.

## Auto-assign public IP

Makes anything launched in that subnet publicly addressable. We enable it in
Phase 2 and **remove it in Phase 7**, when instances move behind the load
balancer and only the ALB stays public — the real production pattern.

## What we built

| Resource | Name | Value |
|---|---|---|
| VPC | `expense-vpc` | `10.0.0.0/16` |
| Subnet | `expense-public-a` | `10.0.1.0/24`, AZ **a** |
| Subnet | `expense-public-b` | `10.0.2.0/24`, AZ **b** |
| Subnet | `expense-db-a` | `10.0.21.0/24`, AZ **a** |
| Subnet | `expense-db-b` | `10.0.22.0/24`, AZ **b** |
| Internet gateway | `expense-igw` | attached to the VPC |
| Route table | `expense-rt-public` | `0.0.0.0/0` → igw · public subnets |
| Route table | `expense-rt-private` | local only · db subnets |

**Cost: $0.** VPCs, subnets, route tables and internet gateways are all free.
Billing begins in Phase 3 with the first EC2 instance.

## A packet's journey, once it all exists

```
your phone
   │  public internet
   ▼
Internet Gateway          ← the 0.0.0.0/0 route sent it here
   │  NAT: public IP → 10.0.1.x
   ▼
EC2 in expense-public-a   ← security group must allow the port (Phase 3)
   │  destination 10.0.21.x matches the local route, stays inside the VPC
   ▼
RDS in expense-db-a       ← never touched the internet, either direction
```

The database is unreachable from outside not because someone remembered a
firewall rule, but because **no route to it exists**. Structurally stronger.

## Gotchas we actually hit

**"CIDR Address overlaps with existing Subnet CIDR"** — when adding several
subnets in one form, AWS pre-fills each new block by copying the one above. If
you don't change the CIDR, you submit a duplicate and nothing saves. Creating
subnets **one at a time** is slower and far harder to get wrong.

**There is no "rename" button in AWS.** The Name column is just a tag. To set
it: select the resource → **Tags** tab → **Manage tags** → add key `Name`.

**Don't bother renaming the Main route table.** Create an explicit
`expense-rt-private` instead and associate the db subnets with it. Every subnet
follows *some* route table; once yours are explicitly associated, whatever Main
says stops mattering. One less thing modified.

**The region selector is hidden** on new Builder Experience accounts. Expected —
you're pinned to one region. Everything lands in `ap-southeast-2` automatically.

**Settings that should stay off when creating the VPC:** IPAM (a service for
organisations managing hundreds of VPCs), IPv6 (a second address system you
don't need), and VPC encryption (forces all internal traffic to be encrypted —
it would silently block the plain HTTP and unencrypted Postgres traffic of
Phases 3–7 and cost you an hour of confused debugging).

---

# Coming up

- **Phase 3** — EC2. ⚠️ **First phase that costs money.** Security groups
  control *what's allowed through*; route tables control *where packets can
  go*. The distinction trips everyone up.
- **Phase 4** — RDS. Security groups referencing other security groups.
- **Phase 5** — S3 + IAM roles. Why an instance profile beats an access key.
- **Phase 6** — CloudFront. Why ACM can't certify an ALB hostname.
- **Phase 7** — ALB + Auto Scaling. Health checks and self-healing.
- **Phase 8** — CloudWatch. Logs vs metrics vs alarms.
- **Phase 9** — CI/CD with OIDC, no long-lived keys.
- **Phase 10** — Terraform.
- **Phase 11** — Teardown and the cost post-mortem.

---

# Glossary

| Term | Meaning |
|---|---|
| **VPC** | Your private, isolated network inside AWS |
| **CIDR** | `10.0.0.0/16` — an IP range; the `/n` is how many bits are fixed |
| **AZ** | Availability Zone — a physically separate data centre |
| **Subnet** | A slice of the VPC's range, pinned to exactly one AZ |
| **Route table** | Lookup list deciding where packets go; most specific match wins |
| **IGW** | Internet Gateway — the door out, plus 1:1 NAT |
| **`0.0.0.0/0`** | "Any address" — the default/catch-all route |
| **Security group** | Stateful firewall on a resource (Phase 3) |
| **ALB** | Application Load Balancer — spreads traffic, needs 2 AZs |
| **IAM role** | Permissions a *machine* assumes — no keys involved |
