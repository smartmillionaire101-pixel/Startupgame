/**
 * Professional jobs (the jobs rework): seven professions with a career
 * ladder each, an employer of every profession in every city, what each
 * background brings (experience and the level it can start at), and the
 * questions each employer asks at interview.
 *
 * Pay is monthly take-home in cost-of-living units (grossed up for the
 * city's income tax, like the part-time jobs in businesses.ts). Experience is
 * counted in months per field; the part-time jobs at local businesses count
 * as 'service'.
 */
import type { MarketId } from './markets.js';
import type { Skill } from './characters.js';

export const WORK_FIELDS = [
  'finance',
  'tech',
  'engineering',
  'consulting',
  'legal',
  'health',
  'service',
] as const;
export type WorkField = (typeof WORK_FIELDS)[number];

export const PROFESSION_IDS = [
  'bank',
  'investment',
  'tech',
  'engineering',
  'consultancy',
  'law',
  'hospital',
] as const;
export type ProfessionId = (typeof PROFESSION_IDS)[number];

interface ProfessionLevel {
  /** 1 (first rung) … 4. */
  level: number;
  /** Stable id (saved on the job). */
  role: string;
  /** Translatable. */
  label: string;
  /** Monthly take-home pay in cost-of-living units. */
  payCol: number;
}

interface InterviewOption {
  /** Translatable. */
  text: string;
  /** The skill this answer leans on. */
  skill: Skill;
  /** How much this employer likes the approach (0–1). */
  fit: number;
}

interface InterviewQuestion {
  id: string;
  /** Translatable. */
  text: string;
  options: InterviewOption[];
}

export interface Profession {
  id: ProfessionId;
  /** The business kind its employers are (data/businesses.ts). */
  kind: string;
  field: WorkField;
  /** Translatable: "Bank", "Law firm"… */
  label: string;
  /** Skills it hires on; the best of them is checked against each level's minimum. */
  skills: Skill[];
  /** Minimum skill per level (index 0 = level 1). */
  skillMin: number[];
  levels: ProfessionLevel[];
  questions: InterviewQuestion[];
}

/** Months of experience in the field each level needs (index 0 = level 1). */
export const LEVEL_MONTHS = [0, 24, 48, 84] as const;

/** Monthly hours by level: 40 for levels 1–2, 50 for level 3, 60 for level 4. */
export const LEVEL_HOURS = [40, 40, 50, 60] as const;

const L = (level: number, role: string, label: string, payCol: number): ProfessionLevel => ({
  level,
  role,
  label,
  payCol,
});
const o = (text: string, skill: Skill, fit: number): InterviewOption => ({ text, skill, fit });
const q = (id: string, text: string, options: InterviewOption[]): InterviewQuestion => ({
  id,
  text,
  options,
});

export const PROFESSIONS: readonly Profession[] = [
  {
    id: 'bank',
    kind: 'employer-bank',
    field: 'finance',
    label: 'Bank',
    skills: ['finance', 'risk'],
    skillMin: [30, 40, 55, 70],
    levels: [
      L(1, 'bank-analyst', 'Analyst', 1.6),
      L(2, 'bank-associate', 'Associate', 2.6),
      L(3, 'bank-vp', 'Vice President', 4.0),
      L(4, 'bank-director', 'Director', 6.0),
    ],
    questions: [
      q('bank-loan', 'A shop owner wants a loan but has thin records. What do you do?', [
        o('Ask for more collateral before anything else', 'risk', 0.65),
        o('Rebuild their cash flow from bank statements', 'finance', 1),
        o('Trust your read of the owner', 'sales', 0.25),
      ]),
      q('bank-fee', 'A big client is angry about a fee. How do you handle it?', [
        o('Point them to the terms they signed', 'risk', 0.25),
        o('Waive it on the spot', 'sales', 0.65),
        o('Explain it and offer a fair fix', 'negotiation', 1),
      ]),
      q('bank-model', 'Your model and the client’s numbers disagree. Then?', [
        o('Walk through both line by line until they agree', 'finance', 1),
        o('Go with the more cautious number', 'risk', 0.65),
        o('Present both and let the client choose', 'publicSpeaking', 0.25),
      ]),
    ],
  },
  {
    id: 'investment',
    kind: 'employer-investment',
    field: 'finance',
    label: 'Investment firm',
    skills: ['investing', 'finance'],
    skillMin: [30, 40, 55, 70],
    levels: [
      L(1, 'inv-analyst', 'Analyst', 1.8),
      L(2, 'inv-associate', 'Associate', 3.0),
      L(3, 'inv-principal', 'Principal', 4.5),
      L(4, 'inv-partner', 'Partner', 7.0),
    ],
    questions: [
      q('inv-pitch', 'A founder pitches a hot market with no revenue yet. Your call?', [
        o('Pass: no revenue, no deal', 'risk', 0.65),
        o('Size the market and the team before deciding', 'investing', 1),
        o('Back them before someone else does', 'fundraising', 0.25),
      ]),
      q('inv-portfolio', 'A portfolio company will run out of cash in four months. What now?', [
        o('Cut costs with the founders and plan a bridge', 'finance', 1),
        o('Write it off and move on', 'risk', 0.25),
        o('Introduce them to other investors', 'fundraising', 0.65),
      ]),
      q('inv-terms', 'Two funds want the same deal. How do you win it?', [
        o('Offer the highest valuation', 'investing', 0.25),
        o('Show the founder how you’ll help them grow', 'publicSpeaking', 0.65),
        o('Agree fair terms quickly and keep your word', 'negotiation', 1),
      ]),
    ],
  },
  {
    id: 'tech',
    kind: 'employer-tech',
    field: 'tech',
    label: 'Tech company',
    skills: ['product', 'leadership'],
    skillMin: [30, 40, 55, 70],
    levels: [
      L(1, 'tech-junior', 'Junior developer', 1.5),
      L(2, 'tech-engineer', 'Software engineer', 2.4),
      L(3, 'tech-senior', 'Senior engineer', 3.5),
      L(4, 'tech-head', 'Head of engineering', 5.0),
    ],
    questions: [
      q('tech-bug', 'The app is down on launch day. First move?', [
        o('Roll back, then find the cause', 'product', 1),
        o('Tell users what is happening', 'publicSpeaking', 0.65),
        o('Get the whole team on a call', 'leadership', 0.25),
      ]),
      q('tech-feature', 'Sales wants a feature by Friday. It needs three weeks. You…', [
        o('Say yes and work the weekend', 'risk', 0.25),
        o('Ship the smallest useful version by Friday', 'product', 1),
        o('Push back and explain the trade-off', 'negotiation', 0.65),
      ]),
      q('tech-team', 'A teammate’s code keeps breaking the build. What do you do?', [
        o('Fix it quietly yourself', 'product', 0.65),
        o('Pair with them and add tests together', 'leadership', 1),
        o('Report it to the manager', 'hiring', 0.25),
      ]),
    ],
  },
  {
    id: 'engineering',
    kind: 'employer-engineering',
    field: 'engineering',
    label: 'Engineering firm',
    skills: ['product', 'risk', 'leadership'],
    skillMin: [30, 40, 55, 70],
    levels: [
      L(1, 'eng-graduate', 'Graduate engineer', 1.4),
      L(2, 'eng-engineer', 'Engineer', 2.2),
      L(3, 'eng-senior', 'Senior engineer', 3.2),
      L(4, 'eng-chief', 'Chief engineer', 4.5),
    ],
    questions: [
      q('eng-site', 'A site inspection finds a crack in a new beam. What do you do?', [
        o('Stop work and check the load calculations', 'risk', 1),
        o('Patch it and keep to the schedule', 'product', 0.25),
        o('Call the client before anything else', 'publicSpeaking', 0.65),
      ]),
      q('eng-budget', 'The project is 10% over budget. Your plan?', [
        o('Find cheaper materials that meet the spec', 'product', 1),
        o('Ask the client for more money', 'negotiation', 0.65),
        o('Cut the safety margins', 'risk', 0.25),
      ]),
      q('eng-crew', 'Two crews argue about who goes first on site. You…', [
        o('Let them sort it out', 'risk', 0.25),
        o('Set a clear schedule and explain why', 'leadership', 1),
        o('Side with the bigger crew', 'negotiation', 0.65),
      ]),
    ],
  },
  {
    id: 'consultancy',
    kind: 'employer-consultancy',
    field: 'consulting',
    label: 'Consultancy',
    skills: ['publicSpeaking', 'sales', 'leadership', 'risk'],
    skillMin: [30, 40, 55, 70],
    levels: [
      L(1, 'con-analyst', 'Analyst', 1.5),
      L(2, 'con-consultant', 'Consultant', 2.5),
      L(3, 'con-manager', 'Manager', 3.8),
      L(4, 'con-partner', 'Partner', 6.0),
    ],
    questions: [
      q('con-case', 'A retailer’s profits fell 20%. Where do you start?', [
        o('Split it into prices, volumes and costs', 'finance', 1),
        o('Interview the store managers', 'leadership', 0.65),
        o('Suggest a new marketing campaign', 'sales', 0.25),
      ]),
      q('con-client', 'The client’s CEO disagrees with your findings. You…', [
        o('Back down to keep the client happy', 'sales', 0.25),
        o('Walk them through the evidence calmly', 'publicSpeaking', 1),
        o('Ask your partner to handle it', 'leadership', 0.65),
      ]),
      q('con-deadline', 'The deck is due tomorrow and the data is late. What now?', [
        o('Draft the story now, drop the numbers in later', 'publicSpeaking', 1),
        o('Ask for a day’s extension', 'negotiation', 0.65),
        o('Use last year’s figures', 'risk', 0.25),
      ]),
    ],
  },
  {
    id: 'law',
    kind: 'employer-law',
    field: 'legal',
    label: 'Law firm',
    skills: ['negotiation', 'risk'],
    skillMin: [30, 40, 55, 70],
    levels: [
      L(1, 'law-paralegal', 'Paralegal', 1.2),
      L(2, 'law-associate', 'Associate', 2.4),
      L(3, 'law-senior', 'Senior associate', 3.6),
      L(4, 'law-partner', 'Partner', 6.0),
    ],
    questions: [
      q('law-contract', 'A client wants to sign a contract today. You spot a risky clause.', [
        o('Flag it and propose safer wording', 'risk', 1),
        o('Let them sign: it’s their call', 'sales', 0.25),
        o('Call the other side to renegotiate', 'negotiation', 0.65),
      ]),
      q('law-dispute', 'Two business partners are heading to court. Your advice?', [
        o('Sue first and hard', 'risk', 0.65),
        o('Try a settlement before court', 'negotiation', 1),
        o('Take the press side first', 'publicSpeaking', 0.25),
      ]),
      q('law-hours', 'A partner asks you to bill hours you didn’t work.', [
        o('Refuse and record only real hours', 'risk', 1),
        o('Do it this once', 'sales', 0.25),
        o('Ask HR quietly', 'leadership', 0.65),
      ]),
    ],
  },
  {
    id: 'hospital',
    kind: 'employer-hospital',
    field: 'health',
    label: 'Hospital',
    skills: ['leadership', 'risk', 'publicSpeaking'],
    skillMin: [20, 40, 55],
    levels: [
      L(1, 'hos-nurse', 'Nurse', 1.6),
      L(2, 'hos-doctor', 'Doctor', 3.0),
      L(3, 'hos-consultant', 'Consultant', 4.5),
    ],
    questions: [
      q('hos-triage', 'Three patients arrive at once. Who do you see first?', [
        o('Whoever arrived first', 'publicSpeaking', 0.25),
        o('Check each quickly and treat the most urgent', 'risk', 1),
        o('Ask a colleague to decide', 'leadership', 0.65),
      ]),
      q('hos-family', 'A worried family wants answers you don’t have yet.', [
        o('Tell them what you know and when you’ll know more', 'publicSpeaking', 1),
        o('Say everything will be fine', 'sales', 0.25),
        o('Send them to the waiting room', 'risk', 0.65),
      ]),
      q('hos-shift', 'Your ward is short-staffed tonight. What do you do?', [
        o('Re-plan the rounds and ask for cover', 'leadership', 1),
        o('Work through without breaks', 'risk', 0.25),
        o('Close beds to new patients', 'negotiation', 0.65),
      ]),
    ],
  },
];

const BY_ID = new Map(PROFESSIONS.map((p) => [p.id, p]));
const BY_KIND = new Map(PROFESSIONS.map((p) => [p.kind, p]));

export const professionById = (id: string): Profession | undefined => BY_ID.get(id as ProfessionId);
export const professionOfKind = (kind: string): Profession | undefined => BY_KIND.get(kind);

/**
 * What each background brings: months of experience per field, the level it
 * can start at in each profession (its skills count as good enough there,
 * though the months still have to be there), and how fast it learns.
 */
export interface HeadStart {
  exp: Partial<Record<WorkField, number>>;
  levels: Partial<Record<ProfessionId, number>>;
  /** Experience per month worked (default 1). */
  learn?: number;
}

export const HEAD_STARTS: Record<string, HeadStart> = {
  // Founders.
  'f-engineer': { exp: { tech: 30 }, levels: { tech: 2, engineering: 1 } },
  'f-banker': { exp: { finance: 30 }, levels: { bank: 2, investment: 1 } },
  'f-dropout': { exp: {}, levels: {}, learn: 1.5 },
  'f-consultant': { exp: { consulting: 30 }, levels: { consultancy: 2 } },
  'f-second-time': {
    exp: { tech: 24, consulting: 24 },
    levels: { tech: 2, consultancy: 2 },
  },
  'f-corporate': {
    exp: { engineering: 24, consulting: 24 },
    levels: { engineering: 2, consultancy: 2 },
  },
  // Investors.
  'i-operator': { exp: { tech: 36, finance: 24 }, levels: { tech: 2, investment: 2 } },
  'i-banker': { exp: { finance: 48 }, levels: { investment: 3, bank: 3 } },
  'i-consultant': {
    exp: { consulting: 36, finance: 24 },
    levels: { consultancy: 2, investment: 2 },
  },
  'i-corporate': {
    exp: { finance: 24, consulting: 24 },
    levels: { investment: 2, consultancy: 2 },
  },
  'i-exited': { exp: { finance: 48, tech: 30 }, levels: { investment: 3, tech: 2 } },
  'i-first': { exp: { finance: 6 }, levels: { investment: 1 } },
  // Bankers.
  'b-commercial': { exp: { finance: 30 }, levels: { bank: 2 } },
  'b-regulator': { exp: { legal: 30, finance: 24 }, levels: { law: 2, bank: 2 } },
  'b-fintech': { exp: { tech: 30 }, levels: { tech: 2 } },
  'b-ib': { exp: { finance: 36 }, levels: { bank: 2, investment: 2 } },
  'b-microfinance': { exp: { finance: 18 }, levels: { bank: 1 } },
  'b-wealthy': { exp: { finance: 30 }, levels: { investment: 2 } },
};

export const headStartOf = (backgroundId: string): HeadStart =>
  HEAD_STARTS[backgroundId] ?? { exp: {}, levels: {} };

// ---------------------------------------------------------------- Employers

export interface EmployerSeed {
  profession: ProfessionId;
  name: string;
  /** District id from the city plan. */
  district: string;
  owner: string;
  street?: string;
}

type Row = [ProfessionId, string, string, string, string?];
const rows = (xs: Row[]): EmployerSeed[] =>
  xs.map(([profession, name, district, owner, street]) => ({
    profession,
    name,
    district,
    owner,
    ...(street ? { street } : {}),
  }));

/** One employer of every profession in every city. Fictional names, of their city. */
export const EMPLOYERS: Record<MarketId, readonly EmployerSeed[]> = {
  'san-francisco': rows([
    ['bank', 'Embarcadero Trust Bank', 'fidi', 'Helen Marsh', 'Montgomery Street'],
    ['investment', 'Pine Street Partners', 'fidi', 'Robert Lin', 'Pine Street'],
    ['tech', 'Folsom Byteworks', 'soma', 'Aisha Grant', 'Folsom Street'],
    ['engineering', 'Dogpatch Structural', 'dogpatch', 'Tom Alvarez', 'Illinois Street'],
    ['consultancy', 'Market Street Advisory', 'fidi', 'Julia Brandt', 'Market Street'],
    ['law', 'Kearny & Bush LLP', 'chinatown', 'Samuel Wong', 'Kearny Street'],
    ['hospital', 'Valencia General Hospital', 'mission', 'Dr. Maria Ortiz', 'Valencia Street'],
  ]),
  lagos: rows([
    ['bank', 'Marina Commercial Bank', 'marina', 'Folake Adeyemi', 'Broad Street'],
    ['investment', 'Ikoyi Capital Partners', 'ikoyi', 'Chuka Obi', 'Awolowo Road'],
    ['tech', 'Yaba Code Works', 'yaba', 'Tunde Bakare', 'Herbert Macaulay Way'],
    ['engineering', 'Ikeja Civil & Structural', 'ikeja', 'Emeka Nwosu', 'Allen Avenue'],
    ['consultancy', 'Eko Strategy Group', 'victoria-island', 'Ngozi Eze', 'Adeola Odeku'],
    ['law', 'Okonkwo & Bello Chambers', 'marina', 'Barrister Ifeoma Okonkwo', 'Marina'],
    ['hospital', 'Surulere General Hospital', 'surulere', 'Dr. Kunle Ajayi', 'Bode Thomas Street'],
  ]),
  london: rows([
    ['bank', 'Threadneedle Mercantile Bank', 'city', 'Charlotte Hayes', 'Threadneedle Street'],
    ['investment', 'Mayfair Harbour Capital', 'mayfair', 'Rupert Ellis', 'Berkeley Square'],
    ['tech', 'Shoreditch Byteworks', 'shoreditch', 'Priya Shah', 'Old Street'],
    ['engineering', 'Thameside Engineering', 'southbank', 'Gareth Owen', 'Belvedere Road'],
    ['consultancy', 'Canary Strategy Partners', 'canary-wharf', 'Fiona Clarke', 'Bank Street'],
    ['law', 'Fetter & Holborn LLP', 'city', 'James Whitfield', 'Fetter Lane'],
    ['hospital', 'Camden Royal Infirmary', 'camden', 'Dr. Aisha Rahman', 'Pratt Street'],
  ]),
  nairobi: rows([
    ['bank', 'Upper Hill Commercial Bank', 'upper-hill', 'Wanjiru Kamau', 'Upper Hill Road'],
    ['investment', 'Westlands Capital Partners', 'westlands', 'David Otieno', 'Waiyaki Way'],
    ['tech', 'Kilimani Silicon Works', 'kilimani', 'Brian Mwangi', 'Argwings Kodhek Road'],
    [
      'engineering',
      'Enterprise Road Engineering',
      'industrial-area',
      'Peter Kiprop',
      'Enterprise Road',
    ],
    ['consultancy', 'Harambee Strategy Group', 'cbd', 'Grace Achieng', 'Kenyatta Avenue'],
    ['law', 'Moi Avenue Advocates', 'cbd', 'Advocate James Mutua', 'Moi Avenue'],
    ['hospital', 'Karen Community Hospital', 'karen', 'Dr. Mercy Njeri', 'Karen Road'],
  ]),
  accra: rows([
    ['bank', 'Airport City Bank', 'airport-city', 'Kwame Asante', 'Liberation Road'],
    ['investment', 'Cantonments Capital', 'cantonments', 'Efua Mensah', 'Cantonments Road'],
    ['tech', 'Osu Digital Works', 'osu', 'Kojo Boateng', 'Oxford Street'],
    ['engineering', 'Jamestown Engineering Works', 'jamestown', 'Yaw Owusu', 'High Street'],
    ['consultancy', 'Gold Coast Advisory', 'airport-city', 'Abena Darko', 'Airport Bypass'],
    ['law', 'Asante & Quaye Chambers', 'makola', 'Lawyer Nana Quaye', 'Kojo Thompson Road'],
    ['hospital', 'East Legon General Hospital', 'east-legon', 'Dr. Ama Ofori', 'Lagos Avenue'],
  ]),
  freetown: rows([
    ['bank', 'Cotton Tree Commercial Bank', 'central', 'Fatmata Kamara', 'Siaka Stevens Street'],
    ['investment', 'Aberdeen Bay Capital', 'aberdeen', 'Mohamed Bangura', 'Cape Road'],
    ['tech', 'Congo Cross Code House', 'congo-cross', 'Ibrahim Sesay', 'Main Motor Road'],
    ['engineering', 'Kissy Engineering Works', 'kissy', 'Abu Conteh', 'Kissy Road'],
    ['consultancy', 'Lion Mountain Strategy', 'central', 'Isatu Koroma', 'Wallace Johnson Street'],
    [
      'law',
      'Lightfoot Boston Chambers',
      'central',
      'Barrister Hawa Turay',
      'Lightfoot Boston Street',
    ],
    [
      'hospital',
      'Wilberforce General Hospital',
      'wilberforce',
      'Dr. Samuel Koroma',
      'Wilberforce Street',
    ],
  ]),
  kigali: rows([
    ['bank', 'Kiyovu Commercial Bank', 'kiyovu', 'Aline Uwase', 'KN 3 Avenue'],
    ['investment', 'Thousand Hills Capital', 'kiyovu', 'Eric Mugisha', 'KN 2 Avenue'],
    ['tech', 'Kacyiru Tech Works', 'kacyiru', 'Patrick Niyonzima', 'KG 7 Avenue'],
    ['engineering', 'Nyabugogo Engineering', 'nyabugogo', 'Jean Habimana', 'KN 1 Road'],
    ['consultancy', 'Imena Strategy Group', 'nyarugenge', 'Claudine Mukamana', 'KN 4 Avenue'],
    ['law', 'Nyarugenge Law Chambers', 'nyarugenge', 'Me Olivier Nshuti', 'KN 76 Street'],
    ['hospital', 'Remera General Hospital', 'remera', 'Dr. Diane Ingabire', 'KG 11 Avenue'],
  ]),
  johannesburg: rows([
    ['bank', 'Sandton Merchant Bank', 'sandton', 'Lerato Mokoena', 'Rivonia Road'],
    ['investment', 'Maude Street Capital', 'sandton', 'Johan van der Merwe', 'Maude Street'],
    ['tech', 'Braamfontein Byteworks', 'braamfontein', 'Sipho Ndlovu', 'Juta Street'],
    ['engineering', 'Marshalltown Engineering', 'marshalltown', 'Pieter Botha', 'Main Street'],
    ['consultancy', 'Rosebank Advisory', 'rosebank', 'Naledi Khumalo', 'Oxford Road'],
    ['law', 'Fox Street Attorneys', 'marshalltown', 'Advocate Thandi Zulu', 'Fox Street'],
    ['hospital', 'Soweto Community Hospital', 'soweto', 'Dr. Themba Dlamini', 'Chris Hani Road'],
  ]),
  cairo: rows([
    ['bank', 'Garden City National Bank', 'garden-city', 'Mona El-Sayed', 'Kasr El Aini Street'],
    ['investment', 'Zamalek Capital Partners', 'zamalek', 'Karim Hassan', '26th of July Street'],
    ['tech', 'New Cairo Digital Labs', 'new-cairo', 'Omar Farouk', '90th Street'],
    [
      'engineering',
      'Heliopolis Engineering Bureau',
      'heliopolis',
      'Tarek Mansour',
      'Baghdad Street',
    ],
    ['consultancy', 'Nile Strategy Group', 'downtown', 'Dina Youssef', 'Talaat Harb Street'],
    ['law', 'Qasr El Nil Law Chambers', 'downtown', 'Ustaz Hany Ibrahim', 'Qasr El Nil Street'],
    ['hospital', 'Maadi General Hospital', 'maadi', 'Dr. Laila Mostafa', 'Road 9'],
  ]),
  dubai: rows([
    ['bank', 'Gate Avenue Bank', 'difc', 'Fatima Al Mansoori', 'Gate Avenue'],
    ['investment', 'Gate Village Capital', 'difc', 'Rashid Al Falasi', 'Gate Village'],
    ['tech', 'Business Bay Tech Labs', 'business-bay', 'Arjun Mehta', 'Marasi Drive'],
    ['engineering', 'Al Quoz Engineering', 'al-quoz', 'Hassan Qureshi', 'Al Khail Road'],
    ['consultancy', 'Creekside Strategy Partners', 'creek', 'Sara Haddad', 'Baniyas Road'],
    ['law', 'Deira Legal Chambers', 'deira', 'Advocate Yousef Al Hashimi', 'Al Maktoum Road'],
    ['hospital', 'Jumeirah General Hospital', 'jumeirah', 'Dr. Noura Al Suwaidi', 'Al Wasl Road'],
  ]),
};
