import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/password";

const prisma = new PrismaClient();

// Deterministic, stable cover images (Picsum returns the same photo per seed).
const cover = (seed: string) => `https://picsum.photos/seed/${seed}/1200/630`;

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function main() {
  console.log("🌱 Seeding database…");

  // Clear existing data in FK-safe order so the seed is idempotent.
  await prisma.comment.deleteMany();
  await prisma.article.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.category.deleteMany();

  // ── Categories ────────────────────────────────────────────────────────────
  const technology = await prisma.category.create({
    data: {
      name: "Technology",
      slug: "technology",
      description:
        "Hardware, software, AI and the people building what comes next.",
    },
  });
  const business = await prisma.category.create({
    data: {
      name: "Business",
      slug: "business",
      description: "Markets, startups, the economy and the world of work.",
    },
  });
  const world = await prisma.category.create({
    data: {
      name: "World",
      slug: "world",
      description: "Politics, climate and the stories shaping our planet.",
    },
  });

  // ── Tags ──────────────────────────────────────────────────────────────────
  const tagNames = [
    "AI",
    "Gadgets",
    "Cloud",
    "Startups",
    "Economy",
    "Markets",
    "Climate",
    "Policy",
  ];
  const tags: Record<string, { id: string }> = {};
  for (const name of tagNames) {
    tags[name] = await prisma.tag.create({
      data: { name, slug: slugify(name) },
      select: { id: true },
    });
  }

  // ── Articles ────────────────────────────────────────────────────────────--
  const articles: {
    title: string;
    slug: string;
    excerpt: string;
    content: string;
    categoryId: string;
    tags: string[];
    views: number;
  }[] = [
    {
      title: "The Quiet Revolution in On-Device AI",
      slug: "the-quiet-revolution-in-on-device-ai",
      excerpt:
        "Powerful models are moving off the cloud and onto the phone in your pocket — and it is quietly redefining what a personal device can do.",
      categoryId: technology.id,
      tags: ["AI", "Gadgets"],
      views: 1280,
      content: `For years, the smartest software on your phone lived somewhere else. A
question went up to a data center, an answer came back down, and the device in
your hand was little more than a window. That arrangement is changing fast.

## Why now

Three trends collided at once:

- **Smaller models.** Techniques like quantization and distillation shrink a
  capable model to a fraction of its original size with little loss in quality.
- **Faster silicon.** Modern phone chips ship with dedicated neural engines
  designed specifically for this kind of math.
- **Privacy pressure.** Keeping data on the device sidesteps a whole category of
  regulatory and trust problems.

## What it unlocks

On-device inference means features that work offline, respond instantly, and
never send your data anywhere. Live translation, photo editing, and smart
assistants all get faster and more private at the same time.

> The most important AI feature of the next few years may be the one you never
> notice is running.

There are limits. The largest, most capable models still need the cloud, and
battery life remains a real constraint. But the direction is clear: more of the
intelligence is moving closer to you.`,
    },
    {
      title: "Why Developers Are Rethinking the Cloud",
      slug: "why-developers-are-rethinking-the-cloud",
      excerpt:
        "After a decade of cloud-first everything, rising bills and the rise of the edge are prompting teams to ask where their code should actually run.",
      categoryId: technology.id,
      tags: ["Cloud", "AI"],
      views: 845,
      content: `The cloud was supposed to end the conversation about infrastructure. Spin up
what you need, pay for what you use, never think about a server again. A decade
in, the conversation is back — louder than ever.

## The bill comes due

Startups that scaled on generous free tiers are discovering that success has a
price tag. Egress fees, managed-service premiums, and idle capacity add up.
Some teams are finding that a handful of well-run machines can do the work of a
sprawling, expensive cloud footprint.

## The edge changes the math

At the same time, computing is spreading outward — to content delivery networks,
regional points of presence, and the devices themselves. Running code closer to
users cuts latency and, increasingly, cost.

None of this means the cloud is going away. For most teams it remains the right
default. But "where should this run?" is once again a real engineering question,
and that is probably healthy.`,
    },
    {
      title: "Small Businesses Bet Big on Automation",
      slug: "small-businesses-bet-big-on-automation",
      excerpt:
        "From neighborhood bakeries to two-person law firms, small companies are adopting tools once reserved for the enterprise — and seeing real returns.",
      categoryId: business.id,
      tags: ["Startups", "Economy"],
      views: 712,
      content: `Walk into a small business today and the back office looks nothing like it did
five years ago. Scheduling, invoicing, inventory, and customer follow-ups that
once ate entire afternoons are increasingly handled by software.

## Doing more with the same team

The appeal is straightforward. Most small businesses are not trying to replace
people — they cannot afford to hire more in the first place. Automation lets a
small team punch above its weight.

- A bakery uses demand forecasting to cut waste on slow days.
- A law firm automates intake forms and document assembly.
- A landscaping company schedules crews and bills clients from one app.

## The catch

The tools are cheaper and easier than ever, but they are not free of effort.
Owners still have to choose well, set things up carefully, and train their
teams. The winners are not the ones who buy the most software — they are the
ones who change how they work to take advantage of it.`,
    },
    {
      title: "Markets Steady as Investors Eye Rate Decision",
      slug: "markets-steady-as-investors-eye-rate-decision",
      excerpt:
        "Stocks held their ground this week as traders weighed mixed economic signals ahead of the central bank's closely watched meeting.",
      categoryId: business.id,
      tags: ["Markets", "Economy"],
      views: 1530,
      content: `Equity markets drifted sideways this week, a calm surface over a great deal of
uncertainty underneath. Investors are waiting — and the thing they are waiting
for is a decision on interest rates.

## A delicate balance

Policymakers face the familiar dilemma. Cut too soon and risk reigniting
inflation; hold too long and risk choking off growth. Recent data has not made
the call any easier:

- Hiring has cooled but not collapsed.
- Consumer spending remains surprisingly resilient.
- Price growth is easing, slowly.

## What to watch

Analysts caution against reading too much into any single week of trading. The
real signal will come from the language around the decision — the hints about
what comes next — far more than the number itself.`,
    },
    {
      title: "Coastal Cities Race to Adapt to Rising Seas",
      slug: "coastal-cities-race-to-adapt-to-rising-seas",
      excerpt:
        "With water creeping higher, urban planners are turning to sea walls, sponge parks and, in some places, managed retreat to protect millions of residents.",
      categoryId: world.id,
      tags: ["Climate", "Policy"],
      views: 998,
      content: `For coastal cities, the future is no longer an abstraction printed on a chart.
It arrives at high tide, in flooded streets and backed-up storm drains, on days
that used to be unremarkable.

## Building with the water

The old instinct was to wall the ocean out. That still has its place, but
planners are increasingly working *with* water rather than against it:

- **Sponge parks** that soak up surges and release them slowly.
- **Restored wetlands** that blunt storms before they reach the city.
- **Elevated infrastructure** designed to flood safely and drain fast.

## Hard choices

In the most exposed neighborhoods, officials are beginning to discuss the option
no one wants to name: managed retreat, moving people and buildings out of harm's
way. It is expensive, painful, and politically fraught — and in some places it
may be unavoidable.

What every approach shares is urgency. The cost of acting keeps rising, but the
cost of waiting rises faster.`,
    },
    {
      title: "Global Summit Ends With Cautious Optimism",
      slug: "global-summit-ends-with-cautious-optimism",
      excerpt:
        "Negotiators left this year's summit with a fragile agreement in hand and a long list of promises still waiting to be kept.",
      categoryId: world.id,
      tags: ["Policy", "Climate"],
      views: 1102,
      content: `After days of late-night sessions and last-minute brinkmanship, delegates
emerged with a deal. Whether it amounts to a breakthrough or merely a pause
depends on what happens after everyone goes home.

## What was agreed

The final text commits participants to clearer targets and a shared timeline for
reporting progress. Supporters called it the most concrete language to come out
of these talks in years.

> Agreements are easy to sign and hard to keep. The work starts now.

## The gap between words and action

Critics were quick to note what the deal lacks: binding enforcement and a
credible plan to pay for its promises. Past summits have produced soaring
language that quietly faded once the cameras left.

For now, the mood is cautious optimism — emphasis, several delegates stressed,
on cautious.`,
    },
  ];

  for (let i = 0; i < articles.length; i++) {
    const a = articles[i];
    await prisma.article.create({
      data: {
        title: a.title,
        slug: a.slug,
        excerpt: a.excerpt,
        content: a.content,
        coverImage: cover(a.slug),
        status: "published",
        views: a.views,
        // Stagger publish dates so ordering is meaningful (newest first).
        publishedAt: new Date(Date.now() - (i + 1) * 24 * 60 * 60 * 1000),
        categoryId: a.categoryId,
        tags: { connect: a.tags.map((name) => ({ id: tags[name].id })) },
      },
    });
  }

  // ── Admin user ────────────────────────────────────────────────────────────
  await prisma.user.deleteMany();
  const isProd = process.env.NODE_ENV === "production";
  // Read credentials from the environment; fall back to known values only
  // outside production so local dev stays convenient.
  const adminEmail = (
    process.env.ADMIN_EMAIL ?? (isProd ? "" : "admin@example.com")
  )
    .trim()
    .toLowerCase();
  const adminPassword =
    process.env.ADMIN_PASSWORD ?? (isProd ? "" : "admin1234");
  if (!adminEmail || !adminPassword) {
    throw new Error(
      "ADMIN_EMAIL and ADMIN_PASSWORD must be set to seed an admin user in production.",
    );
  }
  await prisma.user.create({
    data: {
      email: adminEmail,
      passwordHash: hashPassword(adminPassword),
      role: "admin",
    },
  });

  const [categoryCount, tagCount, articleCount] = await Promise.all([
    prisma.category.count(),
    prisma.tag.count(),
    prisma.article.count(),
  ]);
  console.log(
    `✅ Seed complete: ${categoryCount} categories, ${tagCount} tags, ${articleCount} published articles.`,
  );
  // Avoid printing the password in production logs.
  if (isProd) {
    console.log(`👤 Admin user created: ${adminEmail}`);
  } else {
    console.log(`👤 Admin login: ${adminEmail} / ${adminPassword}`);
  }
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
