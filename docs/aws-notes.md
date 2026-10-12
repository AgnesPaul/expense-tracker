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

# Phase 3 — EC2: your first server

## What EC2 is

AWS owns warehouses of physical servers, each sliced into many **virtual
machines**. You rent one slice. It behaves exactly like a real computer —
own OS, memory, disk, network address — while sharing hardware with strangers
who cannot see you. *Elastic* Compute Cloud: start one in 30 seconds, destroy
it in 5.

## Reading an instance type

```
t3.micro
│ │  └── size: nano · micro · small · medium · large · xlarge…
│ └──── generation (higher = newer, usually cheaper per unit of work)
└────── family: "t" = burstable general purpose
```

The **t family** suits workloads that are mostly idle with occasional spikes —
you bank CPU credits while idle and spend them during bursts. Other families:
`m` balanced, `c` compute-heavy, `r` memory-heavy.

## ⚠️ Stop vs Terminate vs Reboot

| Action | Computer | Disk & files | Still paying? |
|---|---|---|---|
| **Reboot** | restarts | kept | yes — never stopped |
| **Stop** | switched off | **kept** | only for the disk (~$0.02/day) |
| **Terminate** | **destroyed forever** | **deleted** | no |

**Stop** at the end of each session. **Terminate** has no undo.

**The public IP changes when you stop and start.** It's borrowed, not owned.
Phase 7 solves this properly — the load balancer gets a stable name and the
servers hide behind it.

## Security groups — four things that surprise people

A security group is a firewall attached to a machine: a guard with a guest list.

1. **The default is "nobody."** A new group allows zero inbound traffic. The
   machine is unreachable until you write a rule.
2. **Only "allow" rules exist.** There is no deny. Logic is simply: does any
   rule permit this? No → dropped **silently**. A blocked connection doesn't
   error, it hangs until timeout — which looks identical to a broken server.
   **Most "my server isn't responding" problems in AWS are a missing SG rule.**
3. **It's stateful.** Let a visitor in on port 80 and the reply flows back
   automatically, no outbound rule needed. So you only ever think about inbound.
4. **A source can be another security group** ← the important one. Instead of
   an IP, a rule can say "anything belonging to that group." Used in Phases 4
   and 7, where server addresses change constantly but group membership doesn't.

## Route tables vs security groups

| | Route table | Security group |
|---|---|---|
| Answers | Where may traffic *travel*? | Who may come *through the door*? |
| Attached to | A subnet | A machine |
| Remembers connections? | n/a | **Yes** |

You need both. When something doesn't work, check both.

*(A third layer, NACLs, sits at subnet level, is stateless, and is the only
place deny rules exist. Rarely needed.)*

## Amazon Linux 2023 setup

Docker is packaged, but **two plugins are not** and must be installed by hand:

```bash
sudo dnf install -y docker git
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user        # then reconnect for it to apply

sudo mkdir -p /usr/local/lib/docker/cli-plugins

# Compose
sudo curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64   -o /usr/local/lib/docker/cli-plugins/docker-compose

# buildx — modern Compose refuses to build without it
sudo curl -SL https://github.com/docker/buildx/releases/download/v0.38.0/buildx-v0.38.0.linux-amd64   -o /usr/local/lib/docker/cli-plugins/docker-buildx

sudo chmod +x /usr/local/lib/docker/cli-plugins/*
```

`/usr/local/lib/docker/cli-plugins/` is simply where `docker` looks for
subcommands. Drop an executable there and it becomes `docker <name>`.

## Swap — required on t3.micro

1 GB of RAM isn't enough to `npm install` and bundle a React app. Linux doesn't
slow down gracefully when memory runs out; it **kills the biggest process** and
reports `exit code 137`, which explains nothing.

```bash
sudo dd if=/dev/zero of=/swapfile bs=128M count=16   # 2 GB
sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile swap swap defaults 0 0' | sudo tee -a /etc/fstab   # survives reboot
```

RAM is the desk — fast, small. Disk is the cupboard — slow, huge. Swap is
permission to use the cupboard when the desk is full.

## Gotchas we hit

**`compose build requires buildx 0.17.0 or later`** — buildx not installed. See
above. Note the GitHub `releases/latest/download/` shortcut doesn't work for
buildx because its filename contains the version; you need the explicit tag.

**Cloned repo was missing files** — a commit existed locally but was never
pushed, so the server cloned an older state. `git log origin/main..HEAD` shows
what hasn't been pushed.

**`docker compose ps` returned an empty table** — Compose only looks at the
directory you're standing in. Wrong directory, no containers. `docker ps -a`
shows everything regardless, including crashed containers.

**Browser "Connect" needs its own SG rule.** EC2 Instance Connect opens the
session from *AWS's* service IPs, not your laptop. A rule allowing SSH from
"My IP" alone will block the browser button. The Sydney range is
`13.239.158.0/29` — find others in `https://ip-ranges.amazonaws.com/ip-ranges.json`
under service `EC2_INSTANCE_CONNECT`.

**Type `http://` explicitly** when visiting. Browsers assume https, and there's
no certificate until Phase 6.

## What's running

```
EC2 instance (10.0.1.x, public IP via IGW)
└── Docker
    ├── web  (nginx)     port 80 → serves React, proxies /api to api:3000
    ├── api  (Node)      port 3000, talks to db:5432
    └── db   (Postgres)  data on the instance's EBS volume
```

Two layers of networking, same idea at both levels: the **VPC network**
(`10.0.1.x`) between AWS resources, and a **Docker bridge network** inside the
instance where containers reach each other by service name.

## Cost from here

~**$0.45/day** while running — instance ~$0.32, public IPv4 ~$0.12.
**Stop the instance when you finish for the day.**

---

# Phase 4 — RDS: a managed database

## Why move the database off the app server

| | Postgres in a container | RDS |
|---|---|---|
| Backups | **none** | automatic + point-in-time recovery |
| Patching | you | AWS |
| Hardware failure | data gone | restore from backup; optional standby AZ |
| Survives the app server dying | ❌ | ✅ different machine entirely |
| Shared by multiple app servers | ❌ | ✅ — the reason Phase 7 works |

The trade: **no shell access.** There is no OS to log into. You talk to it only
as a database. You lose the ability to tinker and stop being responsible for it.

## Two prerequisites RDS insists on

**DB subnet group** — a named list of subnets RDS may use. Must span **at least
two AZs**, even for a single-AZ database, because it needs somewhere to fail
over *to* if that is ever enabled. This is the Phase 2 two-AZ requirement
arriving.

Point it at the **db** subnets only. A database in a public subnet would have a
route to the internet — the thing the whole layout exists to prevent.

**Security group** — see below.

## 🔑 Security groups referencing security groups

The obvious rule names an address:

> allow 5432 from `10.0.1.47`

It works until the server is replaced and gets a new address — which, from
Phase 7 onward, happens automatically and constantly.

The AWS rule names a **group**:

> allow 5432 from `expense-server-sg`

| | How it works | When servers change |
|---|---|---|
| Guest list of names | "let in Ravi, let in Priya" | rewrite the list every time |
| **Check for a badge** | "anyone wearing the staff badge" | **nothing changes** |

A new server launches wearing `expense-server-sg` → the database accepts it
immediately. The old one is destroyed → its access goes with it. The rule
describes a *relationship between roles*, not a list of machines. **This is why
auto-scaling is possible at all.**

## Managed credentials in Secrets Manager

Choosing **Manage master credentials in AWS Secrets Manager** at creation means
AWS generates the password, encrypts it with KMS, stores it, and can rotate it.
You never see it, type it, or save it — so it cannot end up in a repo, a shell
history, or a screenshot.

The secret appears in Secrets Manager named `rds!db-<uuid>`.

## AWS KMS in one paragraph

Encryption is easy; **key custody** is the hard part. KMS is a vault holding
keys that can never be exported — you hand it data and ask it to encrypt or
decrypt, it checks your IAM permissions, and logs every use. So "who can read
this data" becomes an IAM question you can grant, revoke and audit.

*Envelope encryption*: KMS doesn't encrypt your 20 GB. It generates a one-off
data key, encrypts *that*, and your data is encrypted locally with it. The vault
only ever handles tiny keys while protecting unlimited data.

AWS-managed keys (`aws/secretsmanager`, `aws/rds`) are free. Customer-managed
keys cost ~$1/month and buy policy control you rarely need.

## Settings worth knowing

| Setting | Choice | Why |
|---|---|---|
| Creation method | **Full configuration** | Express hides VPC/subnet/SG choices |
| Engine | **Amazon RDS**, not Aurora | Aurora costs several times more and is AWS-specific |
| Public access | **No** | |
| Security group | `expense-db-sg`, **remove `default`** | the form adds `default` silently |
| Initial database name | **`expense`** | ⚠️ blank = a server with no database in it |
| Storage autoscaling | **off** | grows the bill silently |
| RDS Proxy | **off** | ~$0.72/day — more than the database. The app already pools |
| Deletion protection | **off** | you must delete this in Phase 11 |
| Certificate authority | default | |

## Gotchas we hit

**Free plan caps backup retention.** 7 days was rejected with *"exceeds the
maximum available to free tier customers"*. 1 day works. The Free plan doesn't
only cap spending — it quietly limits settings too.

**A generated password breaks a connection URL.** `postgres://user:pass@host/db`
is parsed as a URL, so `#` truncates it, `@` splits it, `/` ends the host. The
failure is `TypeError: Invalid URL` from `pg-connection-string`.

Fix: pass credentials **discretely** — `PGHOST`, `PGUSER`, `PGPASSWORD`,
`PGDATABASE`, `PGPORT`. node-postgres reads them from the environment when no
connectionString is given. Nothing is parsed, so nothing can break.

**`.env` interpolates `$`; `env_file` does not.** Compose substitutes `${...}`
in `.env` values, so a password containing `$` is mangled. An `env_file:` entry
is passed to the container **verbatim**. Put generated secrets there.

**`${VAR-default}` vs `${VAR:-default}`** — with a colon, an empty value falls
back to the default; without, set-but-empty stays empty. Use the no-colon form
when "explicitly blank" must mean something.

**`git pull` does not change a built image.** An image is a snapshot of the code
*at build time*. After pulling on the server you must `docker compose up -d
--build`, or you run old code against new config — and error messages won't
match the source you're reading. Phase 9 removes this trap for good.

## Cost

~$0.55/day — `db.t4g.micro` ~$0.43, 20 GB storage ~$0.12.
**Combined with EC2: ~$1/day.** RDS can be stopped for up to 7 days at a time.

---

# Phase 5 — S3 and IAM roles

## S3 is not a disk

| | A disk | S3 |
|---|---|---|
| How you use it | open, seek, write a few bytes | **PUT** a whole object, **GET** a whole object |
| Folders | real directories | **fake** — just `/` in the key |
| Capacity | fixed | effectively unlimited |
| Durability | one disk | copied across several data centres |

`receipts/7/photo.jpg` is not three nested folders — that entire string is the
object's **key**. The console draws folders because people like folders.

Bucket names are **globally unique across all of AWS**.

**Block Public Access — leave all four on.** Publicly readable buckets are a
famous breach category. Serve private objects with pre-signed URLs instead.

## 🔑 IAM roles — why no credentials exist

| | How it works | When it leaks |
|---|---|---|
| **Access key** | a copy of the key, written down on the server | anyone who finds it has access **forever**, until you rotate |
| **IAM role** | "anything wearing this uniform may do X" | revoke the role and access stops **instantly** — there was never a key |

An EC2 instance asks the **instance metadata service** at `169.254.169.254`
(unreachable from anywhere else) who it is, and receives **temporary
credentials** carrying an `Expiration` — valid a few hours, refreshed
automatically, never written to disk.

The AWS SDK checks there by itself, so application code contains **no key, no
secret, no configuration**. Locally the same SDK falls back to `~/.aws`, so no
dev/prod branching is needed either.

See it yourself:

```bash
TOKEN=$(curl -sX PUT http://169.254.169.254/latest/api/token \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 60")
curl -s -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/iam/security-credentials/
```

## Least privilege, read literally

```json
{
  "Effect": "Allow",
  "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
  "Resource": "arn:aws:s3:::expense-receipts-2026/*"
}
```

Three actions, one bucket. It cannot list buckets, create or delete the bucket,
touch any other bucket, or do anything outside S3. **That is the entire blast
radius if the app is compromised.**

⚠️ `arn:...:bucket` is *the bucket*; `arn:...:bucket/*` is *the objects in it*.
Different resources — a common cause of puzzling AccessDenied errors.
`ListBucket` applies to the former, `GetObject` to the latter.

## Pre-signed URLs

The bucket stays private. The server generates a URL signed with its temporary
credentials, valid for a set window (300s here). The browser fetches the object
**directly from S3** — the file never passes through the app server.

Test it: open the signed link, wait past the expiry, refresh. It dies.

## ⚠️ IMDS hop limit — the container gotcha

Every network packet carries a hop counter (TTL); each device that forwards it
subtracts one, and at zero the packet is discarded. AWS stamps metadata
responses with a hop limit of **1** on purpose, so credentials physically
cannot leave the instance.

**Docker's bridge counts as a hop.** So from inside a container the response
dies in transit and the SDK reports "could not load credentials" with no
explanation.

Fix: **EC2 → Instance → Actions → Instance settings → Modify instance metadata
options → Response hop limit 1 → 2.**

This is the documented fix (ECS and EKS set 2 automatically) but it is a real,
if small, tradeoff — you have widened what can reach those credentials.

## Implementation notes

Uploads stream from memory straight to S3 and **never touch the instance's
disk** — that is what keeps the server stateless for Phase 7. Capped at 5 MB,
images and PDFs only. Replacing a receipt deletes the previous object rather
than orphaning it.

## Using the same role for more than S3

A role is a uniform; the policy is the sentence describing what it permits.
Add statements and the uniform does more:

| Permission | Lets the server | Phase |
|---|---|---|
| `secretsmanager:GetSecretValue` | read the db password itself | 5 |
| `logs:PutLogEvents` | ship logs to CloudWatch | 8 |
| `ecr:BatchGetImage` | pull private Docker images | 9 |
| `AmazonSSMManagedInstanceCore` (managed) | be deployed to remotely | 9 |
| `rds-db:connect` | connect with **no password at all** | — |

And roles are not only for EC2. The **trusted entity** decides who may wear the
uniform: an EC2 instance, a Lambda, an ECS task, another AWS account, or an
external identity provider. That last one is how Phase 9 lets GitHub Actions
deploy with **no AWS keys stored in the repo**.

> The pattern generalises: wherever you would be tempted to store an AWS key,
> there is a role that removes the need for one.

## Removing the last password on disk

With `DB_SECRET_ID` set, the app fetches the RDS username and password from
Secrets Manager at startup using its IAM role. The password then exists
**nowhere on the machine** — not in a file, an image, or an environment
variable. Rotating it needs a restart, not a redeploy.

**Split config by sensitivity:**

| Plainly in config | From Secrets Manager |
|---|---|
| host, port, database name | **username, password** |

A hostname is not a secret: it resolves to a private address that doesn't exist
outside the VPC, and the database refuses anyone lacking both credentials and
the right security group.

**⚠️ An RDS-managed secret (`rds!db-...`) contains only `username` and
`password`** — no host. Deleting the file that held `PGHOST` breaks the app
even though the secret loads fine.

**⚠️ Credentials must load before the pg Pool is constructed**, hence the
dynamic `await import('./db')` in `index.ts` and `migrate.ts`.

**⚠️ `!` in an interactive bash double-quoted string triggers history
expansion**, mangling `rds!db-...`. Use a quoted heredoc — `<<'EOF'` — which
takes every line literally. The same trick keeps `$` in a password safe.

## Cost

Effectively **$0** at this scale. Storage ~$0.025/GB/month; a handful of
receipt images is fractions of a cent.

---

# Phase 6 — CloudFront and HTTPS

## HTTPS without owning a domain

A certificate is an **ID card with a name on it**, and you can only get one for
a name you own. You do not own `54.206.x.x`, so no certificate is possible for
an IP address.

CloudFront gives you a name **AWS owns** — `d3e7irv07htoun.cloudfront.net` —
and AWS already holds a valid certificate for `*.cloudfront.net`. You borrow
theirs. Real HTTPS, no domain purchase, no cost.

⚠️ **Leave the domain field blank at creation.** Filling it in makes CloudFront
try to provision a certificate for a name you would have to prove you own.

Set **Viewer protocol policy: Redirect HTTP to HTTPS** so plaintext arrivals
are bounced before any data moves.

**Browsers refuse to install a PWA over HTTP** — this phase is what makes
"Add to Home Screen" possible.

## Cache behaviors — one origin, different rules per path

A behavior is a rule matched by URL path. CloudFront reads them **top to
bottom and uses the first match**, so `Default (*)` must always be last.

| Precedence | Path | Methods | Cache policy | Origin request policy |
|---|---|---|---|---|
| 0 | `/api/*` | **all** | **CachingDisabled** | **AllViewerExceptHostHeader** |
| 1 | `Default (*)` | GET, HEAD | CachingOptimized | None |

**All methods on `/api/*`** — a POST is rejected at the edge otherwise; the
origin never hears about it.

**AllViewerExceptHostHeader** — CloudFront strips most headers, cookies and
query strings by default. Without this, `?month=2026-10` vanishes and filters
silently stop working.

**Single origin for UI and API means CORS cannot arise.** Not configured
around — it never comes up.

## 🔑 Caching, properly

Each of 400+ edge locations is a **corner shop**; the origin is the warehouse.
Shop has it on the shelf → `x-cache: Hit`. Doesn't → orders from the warehouse,
serves it, and keeps a copy → `x-cache: Miss`.

Each edge stocks its own shelf independently, so a Miss at a fresh location is
normal.

| Content | Analogy | Cache? |
|---|---|---|
| Hashed JS/CSS | **tinned food** — never changes | forever |
| `index.html` | same name every build | **never** |
| API responses | **personal mail** | **never** |

Caching an API response is a **correctness bug**, not just staleness: you would
serve one person's data to another.

### A cache policy defines two things

1. **How long to keep** — CachingOptimized: default TTL 1 day, max 1 year.
   Used only when the origin sends no `Cache-Control`; otherwise the origin's
   label wins, clamped to those bounds.
2. **The cache key — what counts as "the same request."** CachingOptimized
   builds it from **the URL path only**, ignoring query strings, cookies and
   headers, so every viewer worldwide shares one copy.

That second part is why it must never touch an API:

```
GET /api/expenses?month=2026-10   → key "/api/expenses"
GET /api/expenses?month=2026-09   → key "/api/expenses"   ← same key!
```

"Optimized" means optimised for **hit ratio**, not correctness.

### Two layers, easy to confuse

- **Cache policy** — the shop's general rule, set in CloudFront
- **`Cache-Control`** — the expiry label on each item, set by the origin

CachingOptimized means "keep things **and read the label**." Which is why the
origin has to send labels at all.

### The hashed-filename trick

Vite writes `index-Bdiqe9lm.js`. Change the content and the **filename**
changes, so the stale copy is simply never requested again — safe to cache for
a year with no invalidation, ever.

`index.html` cannot be hashed (it is what the browser asks for by name), and it
*points at* the hashed files. Cache it and visitors load an old page referencing
assets that no longer exist — a blank screen, and the classic broken deploy.

```nginx
location /assets/     { add_header Cache-Control "public, max-age=31536000, immutable"; }
location = /index.html { add_header Cache-Control "no-cache"; }
location = /sw.js      { add_header Cache-Control "no-cache, no-store, must-revalidate"; }
```

### Measured

| Request for the same asset | Time |
|---|---|
| 1st (Miss — went to Sydney) | 1.41s |
| 2nd (Hit — from the edge) | **0.17s** |

## Gotchas

**Custom VPCs have DNS hostnames disabled.** The default VPC has them on; one
you build yourself does not — so an instance gets a public IP but **no public
DNS name**, and CloudFront will not accept a bare IP as an origin.
Fix: **VPC → Edit VPC settings → Enable DNS hostnames.**

**Origin protocol must be HTTP only.** The instance has no certificate of its
own, so an HTTPS origin connection fails with 502.

**"Billing: Missing permissions"** in the CloudFront console is cosmetic — the
project identity cannot read billing APIs. The distribution is unaffected.

**Do not enable WAF** at creation — ~$5/month minimum plus per-request charges.

## What is better, and what is not

Better: encrypted browser↔CloudFront, PWA installable, distant users served
locally, CORS structurally impossible.

Still imperfect:
- **CloudFront → EC2 is still plaintext.** The exposed hop moved from the
  public internet into AWS's network — an improvement, not a fix.
- **The EC2 instance is still directly reachable** by IP, bypassing CloudFront
  entirely. (A secret custom header plus an nginx check is the usual fix.)
- **Stopping the instance changes its DNS name**, breaking the origin.

Phase 7's load balancer addresses all three: a stable name, a real certificate,
and instances with no public address at all.

## Cost

CloudFront's always-free tier covers **1 TB out and 10M requests per month**.
This phase adds **$0**.

---

# Phase 7 — Load balancing and auto-scaling

## An ALB is a fleet, not a machine

There is no server to point at. AWS runs nodes **inside each subnet you give
it**, scales them with traffic, and replaces failures invisibly. Hence the
two-subnet requirement.

Consequence: **an ALB has no fixed IP.** Its DNS name resolves to several
addresses (one per AZ) which change over time, so you always refer to it **by
name**. That is also what makes it a stable origin for CloudFront — the name
outlives every server behind it.

## Anatomy

```
Listener       "I accept HTTP on port 80"
   │
Rules          "/api/* → this group, everything else → that group"
   │
Target Group   a pool of servers + how to check they are alive
   │
Targets        the instances
```

Because an ALB reads HTTP, one ALB can serve many apps via path or host rules.
Real systems run **one ALB with many rules**, not many ALBs — ALBs are the
expensive part.

## Choosing a load balancer

| Type | Layer | Understands | For |
|---|---|---|---|
| **ALB** | 7 | HTTP — paths, headers, cookies | websites, APIs |
| **NLB** | 4 | TCP/UDP only | extreme throughput, static IP, raw TCP |
| **GWLB** | 3 | raw packets | inserting firewall/inspection appliances |
| CLB | — | legacy (2009) | nothing; a tutorial suggesting it is ~8 years stale |

An NLB cannot route by URL path — it never reads the URL.

## Health checks

| Setting | Used | Meaning |
|---|---|---|
| Interval | 10s | how often to ask |
| Timeout | 5s | how long to wait before calling it a failure |
| Unhealthy threshold | 2 | **consecutive** failures before removal |
| Healthy threshold | 2 | consecutive successes before return |

Thresholds exist so one dropped packet does not eject a healthy server. Set
them to 1 and targets flap.

Unhealthy targets **stay registered** and keep being checked; they rejoin
automatically on two passes. Nothing to restart.

States: `initial` → `healthy` / `unhealthy` → `draining` → gone. `unused`
means no listener points at the group.

## Connection draining

Deregistering stops **new** requests immediately but lets in-flight ones finish
(deregistration delay, default **300s** — 30s is plenty for most apps).
Meanwhile the instance gets `SIGTERM`.

That pairs with the Phase 1 shutdown handler: the ALB stops sending work, the
app finishes what it holds and exits. **Both halves are required** for a deploy
nobody notices.

## 🔑 Security group vs target group

Confusingly similar names, completely unrelated things.

| | Security group | Target group |
|---|---|---|
| What | a **firewall** | a **list of servers** + health policy |
| Attached to | one resource | used by a load balancer |
| Answers | "may this traffic enter?" | "where do I send this?" |
| Health checks | ❌ | ✅ |
| When wrong | traffic blocked → **timeout** | traffic sent nowhere |

**The target group reports the symptom; the security group is usually the
cause.** An unhealthy target is where you notice a problem and almost never
where you fix it.

## 🔑 Inbound vs outbound — who *starts* the conversation

Stateful means **replies are free**. Rules only govern who may *begin* a
conversation.

```
visitor ──▶ ALB     visitor starts    → ALB INBOUND
ALB ────▶ visitor   reply             → automatic
ALB ────▶ EC2       the ALB starts    → ALB OUTBOUND   ← the health check
EC2 ────▶ ALB       reply             → automatic
```

**A health check is not a reply.** It is a new connection the ALB opens every
10 seconds on its own, so the **ALB's outbound rules** govern it.

### ⚠️ The bug that cost an hour

Target showed `Target.Timeout`. The instance's inbound rules were correct —
port 80 open from `0.0.0.0/0` **and** from the ALB's group. The cause was
`expense-alb-sg` having **no outbound rules at all**, so the health check never
left. AWS adds "all traffic out" to new security groups by default; it had been
cleared.

> **When two AWS resources time out, check both ends: inbound on the receiver
> AND outbound on the sender.**

### Which outbound rules to tighten

| | Reaches | Tighten? |
|---|---|---|
| **ALB** | only its targets | ✅ one rule describes everything it does |
| **RDS** | nothing — it only replies | ✅ can be emptied entirely |
| **EC2** | Docker Hub, GitHub, repos, Secrets Manager, S3, DNS… | ❌ impractical, breaks deploys |

> Tighten outbound where the destination list is small and stable. Leave it
> open where it is not. Real egress filtering happens at the VPC level
> (NAT + proxy), not in security group rules.

## AMI — a photograph of a disk

Every new machine is born as a copy. Yours holds the OS, Docker + plugins,
swap, the repo, `.env`, built images and restart policies.

**Not in the AMI** (machine settings, not disk contents) — must be set in the
launch template:

- **IAM instance profile** — without it, no Secrets Manager → no DB password
- **IMDS hop limit `2`** — without it, containers cannot fetch credentials
- Security group, instance type, subnet

It is safe to bake this image **because Phase 5 removed the password from
disk** — `.env` holds only a hostname and a secret *name*.

### Baked image vs configure-at-boot

| | Baked AMI | User-data script |
|---|---|---|
| Boot | **~30s** | 3–10 min |
| Depends on | nothing | GitHub/Docker Hub being up |
| Changing it | rebuild the image | edit the script |

A replacement server failing to start because GitHub is down is a terrible
property when it is replacing one that just died. Real systems **bake the slow
stable layer and script the fast-changing one**.

An AMI is really EBS snapshots plus metadata — which is why launching is fast,
and why **deleting an AMI does not delete its snapshots**. Orphaned snapshots
cost money forever (see Phase 11).

## Restart policies

`restart: unless-stopped` so containers start when Docker starts — i.e. on
boot. Without it a fresh ASG instance boots with Docker running and **no
containers**, fails health checks, gets replaced, and loops forever.

| Policy | Behaviour |
|---|---|
| `no` (default) | never restarts |
| `on-failure` | only after a crash |
| `always` | even one you stopped deliberately |
| **`unless-stopped`** | restarts unless you stopped it on purpose |

**Not universal.** Something must own restarts; the only question is what:

| How you run it | Who restarts |
|---|---|
| Docker Compose on a VM | **the restart policy** ← here |
| systemd wrapping Docker | `Restart=` |
| **ECS / Kubernetes** | the scheduler — **remove the policy, it fights them** |
| ASG | replaces the whole machine |

⚠️ Never give a **one-shot job** (migration, batch import) `restart: always` —
it loops forever.

## Auto Scaling Group

Registers every instance it creates into the **target group**, so the list
changes while the load balancer stays still.

| Setting | Value | Why |
|---|---|---|
| Subnets | **both** public | spread across AZs |
| **ELB health checks** | **ON** | otherwise the ASG only notices a *crashed* machine, not a *broken app* |
| Grace period | 180s | boot + Docker + RDS connect before checks count; too short = killed mid-startup |
| Desired / min / max | 2 / 2 / 4 | |

**The Activity tab** is the first place to look when an ASG misbehaves — every
launch, termination and reason is logged there.

## The two demos — measured

**Terminate an instance outright.** ASG logged
`Launching a new EC2 instance` within ~30s; replacement healthy in ~3 min.

**Break the app, not the machine** (`FORCE_UNHEALTHY=true` → `/health` returns
503). This is the failure an ASG alone cannot see: OS fine, CPU normal, app
wrong.

```
app reports unhealthy
   → ALB stops routing to it          ~20s   (users protected)
   → ASG accepts the ALB's verdict
   → terminates the machine
   → rebuilds from the AMI, which never had the flag
```

> *"an instance was taken out of service in response to an ELB system health
> check failure"* — the ASG's own log line.

**50 of 50 requests returned 200 across both demos. Zero failed requests.**

Two independent systems, one job each: the **ALB** protects users now by
routing around the problem; the **ASG** fixes the cause by replacing the
machine. Neither needs the other, and neither needs a human.

None of it works without the Phase 1 decisions: **stateless**, so any server
can serve any request; and **a real `/health`**, so "running" can be
distinguished from "working".

## Gotchas

**502 from a fresh instance** = nginx is up, the api is not *yet*. nginx is
ready in ~2s, the api in ~20–40s (fetch secret → connect RDS → migrate). A
transient 502 during startup is correct behaviour, not a fault.

**`~` is whoever you currently are.** As root it is `/root`, not
`/home/ec2-user`. Use absolute paths on a server.

**Deregistering shows `draining` for up to 300s.** Expected, not stuck.

## Pets vs cattle

A **pet** is a server with a name you would nurse back to health. **Cattle** are
interchangeable and replaced without ceremony. This phase converted one pet into
two cattle.

## Cost

ALB ~**$0.55/day** — the most expensive single thing here, and the first to
delete in Phase 11. Two instances + RDS + ALB ≈ **$1.55/day**.

---

# Coming up

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
