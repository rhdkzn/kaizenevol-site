// Welcome flow templates — inbound leads (source: Website) who haven't booked.
// Copy source of truth: KaizenEvol vault .brain/copy/kaizenreach/email/2026-07-05-welcome-flow-v1.md
// Underscore prefix keeps this file from deploying as an endpoint.

export const CALENDLY = 'https://calendly.com/rahaid-kaizenevol/initial-call';
export const WELCOME_FROM = 'Rahaid @ KaizenEvol <rahaid@mail.kaizenevol.com>';
export const WELCOME_REPLY_TO = 'rahaid@kaizenevol.com';

// Delay before each step may send, keyed by the step being sent (ms).
// Step 1 instant, 2 = +1d after 1, 3 = +2d after 2, 4 = +2d after 3, 5 = +3d after 4.
const DAY = 864e5;
export const WELCOME_DELAYS = { 1: 0, 2: 1 * DAY, 3: 2 * DAY, 4: 2 * DAY, 5: 3 * DAY };
export const WELCOME_LAST_STEP = 5;

// KaizenDesk-only enquiries don't get the KaizenReach ads pitch.
export function isWelcomeEligible(lead) {
  const niche = (lead.niche || '').toLowerCase();
  if (niche.startsWith('kaizendesk')) return false;
  return !!(lead.email && lead.email.trim());
}

function nicheWords(lead) {
  const n = (lead.niche || '').toLowerCase();
  if (n.includes('kitchen')) return { plural: 'kitchen remodelers', jobs: 'kitchen remodelling jobs', trade: 'remodeler' };
  if (n.includes('bathroom')) return { plural: 'bathroom renovators', jobs: 'bathroom refurbs', trade: 'renovator' };
  if (n.includes('loft')) return { plural: 'loft conversion specialists', jobs: 'loft conversions', trade: 'loft specialist' };
  return { plural: 'renovation specialists', jobs: 'renovation jobs', trade: 'specialist' };
}

function firstName(lead) {
  const name = (lead.contactName || lead.owner || '').trim();
  return name ? name.split(/\s+/)[0] : '';
}

export function buildWelcomeEmail(step, lead) {
  const name = firstName(lead);
  const hi = name ? `Hi ${name},` : 'Hi,';
  const city = (lead.area || '').trim();
  const { plural, jobs, trade } = nicheWords(lead);
  const areaPhrase = city || 'your area';
  const spotPhrase = city ? `the ${city} spot` : 'the spot in your area';

  if (step === 1) return {
    subject: name ? `Got your enquiry, ${name}` : 'Got your enquiry',
    text: [
      hi, '',
      `Got your enquiry. Here's what happens next.`, '',
      `We build booked-job pipelines for ${plural}. Not leads. Booked appointments, with homeowners who've already told us their budget, timeline and project size before they reach your phone.`, '',
      `The target we set together is simple: qualified ${jobs} at £5,000+ project value, on your calendar every month. And you don't pay our management fee until we hit the number we agree.`, '',
      `The quickest way to see if ${areaPhrase} is a fit is a short call:`, '',
      CALENDLY, '',
      `Can't do this week? No problem. Over the next few days I'll show you exactly how the system works, what the numbers look like, and why we only take one ${trade} per area.`, '',
      'Rahaid', 'KaizenEvol',
    ].join('\n'),
  };

  if (step === 2) return {
    subject: 'Why you keep quoting for people who were never going to buy',
    text: [
      hi, '',
      'Quick question. How many quotes did you drive to last month that went nowhere?', '',
      `Not because your price was wrong. Because the homeowner was never spending £5,000 in the first place.`, '',
      `That's the problem with shared lead platforms. You pay for a name and a phone number, so do four other ${plural}, and nobody's checked whether the job is real.`, '',
      `We do it the other way round. Every homeowner goes through a filter before they get near your diary. Budget. Timeline. Project size. If they don't clear the bar, you never hear about them.`, '',
      `So the appointments that land on your calendar are with people who've already said the magic words: what they want, when they want it, and what they're prepared to spend.`, '',
      `If you want to see the filter itself, I'll walk you through it on a call. Takes 20 minutes.`, '',
      CALENDLY, '',
      'Rahaid',
    ].join('\n'),
  };

  if (step === 3) return {
    subject: `Three numbers most ${plural} can't answer`,
    text: [
      hi, '',
      `Most ${plural} I speak to know their material margins to the pound. Then I ask three questions and the line goes quiet:`, '',
      'What does a lead cost you?',
      'What does a booked appointment cost you?',
      'What does a signed job cost you?', '',
      `Nobody knows, because referrals and shared platforms don't come with receipts. And if you don't know what a signed job costs, you can't buy more of them. Your pipeline stays whatever word of mouth decides it is this month.`, '',
      `When we run your ads, you get all three numbers every week. Spend in, appointments out, jobs signed. You'll know what next month looks like before it starts.`, '',
      `Happy to work out your current numbers with you on a call, whether we end up working together or not. Bring last month's figures and I'll bring a calculator.`, '',
      CALENDLY, '',
      'Rahaid',
    ].join('\n'),
  };

  if (step === 4) return {
    subject: `If you've paid for marketing before and got nothing`,
    text: [
      hi, '',
      `If you've tried ads before, or paid an agency and got a monthly report instead of booked jobs, this one's for you.`, '',
      `I'm not going to tell you those companies were all cowboys. Some were. Mostly they just had no reason to perform, because they got paid whether your phone rang or not.`, '',
      `So we flipped it. We agree an appointment target up front. Until we hit it, you don't pay our management fee. That's not a discount or a trial. It's just the order things should happen in: results first, fee second.`, '',
      `And because we only take one ${trade} per area, we can't afford passengers. If we don't fill your calendar, we've burned ${spotPhrase} for nothing.`, '',
      `If that sounds fairer than the last thing you tried, let's talk:`, '',
      CALENDLY, '',
      'Rahaid',
    ].join('\n'),
  };

  if (step === 5) return {
    subject: name ? `Last one from me, ${name}` : 'Last one from me',
    text: [
      hi, '',
      'Last one from me, promise.', '',
      `You enquired for a reason. Usually it's one of two: the quiet months are getting harder to laugh off, or you're watching worse ${plural} win the best jobs in ${areaPhrase} because they show up online first.`, '',
      `Either way, the fix is the same and you've seen how it works: qualified homeowners, filtered before they reach you, fee only after we hit the target. One ${trade} per area.`, '',
      `I can't hold ${spotPhrase} indefinitely. If now's not the time, genuinely no hard feelings. Reply with "later" and I'll check back in a couple of months instead.`, '',
      `Otherwise, grab a slot and let's look at your numbers:`, '',
      CALENDLY, '',
      'Rahaid', 'KaizenEvol',
    ].join('\n'),
  };

  return null;
}
