/**
 * The industry an idea sounds like (player feedback: "Mmna — Health tech
 * providing access to quality care" was founded as Business software, the
 * industry picker's default, untouched). The setup suggests one from the idea
 * as you type, until you pick one yourself; nothing is chosen for you before.
 */
import type { Industry } from '@runway/engine';

/** Words that point to an industry, English and French, matched at word starts. */
const WORDS: [Industry, string[]][] = [
  [
    'healthtech',
    [
      'health',
      'care',
      'clinic',
      'hospital',
      'doctor',
      'patient',
      'nurse',
      'pharma',
      'medic',
      'medecin',
      'médecin',
      'santé',
      'sante',
      'soin',
      'telemed',
      'dental',
      'dentist',
      'wellness',
      'mental',
      'maternal',
      'insurance claims',
    ],
  ],
  [
    'logistics',
    [
      'logistic',
      'deliver',
      'delivery',
      'courier',
      'parcel',
      'shipping',
      'shipment',
      'freight',
      'truck',
      'lorry',
      'fleet',
      'dispatch',
      'warehouse',
      'livraison',
      'livreur',
      'colis',
      'transport',
      'entrepôt',
      'last mile',
    ],
  ],
  [
    'agritech',
    [
      'farm',
      'agri',
      'crop',
      'harvest',
      'livestock',
      'poultry',
      'fish farm',
      'seed',
      'fertili',
      'cocoa',
      'maize',
      'cassava',
      'agricult',
      'ferme',
      'récolte',
      'éleva',
    ],
  ],
  [
    'edtech',
    [
      'school',
      'student',
      'teacher',
      'tutor',
      'lesson',
      'learn',
      'course',
      'exam',
      'educat',
      'classroom',
      'école',
      'ecole',
      'élève',
      'eleve',
      'enseign',
      'cours',
      'formation',
      'étudiant',
    ],
  ],
  [
    'fintech',
    [
      'pay',
      'payment',
      'bank',
      'loan',
      'lend',
      'credit',
      'saving',
      'wallet',
      'money',
      'remittance',
      'insur',
      'invest',
      'ledger',
      'fintech',
      'paiement',
      'banque',
      'prêt',
      'épargne',
      'argent',
      'assurance',
    ],
  ],
  [
    'ecommerce',
    [
      'shop',
      'store',
      'marketplace',
      'e-commerce',
      'ecommerce',
      'online sell',
      'sell online',
      'retail',
      'grocer',
      'fashion',
      'boutique',
      'commerce',
      'magasin',
      'vente en ligne',
    ],
  ],
  [
    'saas',
    [
      'software',
      'saas',
      'crm',
      'payroll',
      'invoic',
      'accounting',
      'hr ',
      'b2b',
      'dashboard',
      'logiciel',
      'facturation',
      'comptab',
      'gestion',
    ],
  ],
];

/**
 * The industry the idea's words point to most (ties: the earlier, more
 * specific one in WORDS: "health insurance" is health, "school fees" a school),
 * or null when nothing matches.
 */
export function industryFromIdea(text: string): Industry | null {
  const s = ` ${text.toLowerCase().replace(/[^\p{L}\p{N}\- ]+/gu, ' ')} `;
  let best: Industry | null = null;
  let most = 0;
  for (const [industry, words] of WORDS) {
    const n = words.filter((w) => s.includes(` ${w}`)).length;
    if (n > most) {
      best = industry;
      most = n;
    }
  }
  return best;
}
