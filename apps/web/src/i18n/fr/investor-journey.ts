/** The investor journey: chapters, steps and the inbox notes when a chapter completes. */
const CHAPTERS: [string, string][] = [
  ['The First Cheque', 'Le premier chèque'],
  ['The Track Record', 'Le palmarès'],
  ['Fund I', 'Fonds I'],
  ['The Firm', 'La société de gestion'],
  ['The Legacy', 'L’héritage'],
];

/** The engine's inbox notes when a chapter completes (exact text, via tx()). */
const notes: Record<string, string> = {};
CHAPTERS.forEach(([en, fr], i) => {
  // Chapters can finish out of order: the "next" may be any other one.
  for (const [nen, nfr] of CHAPTERS.filter((_, j) => j !== i))
    notes[`Chapter ${i + 1} complete: ${en}. Next: ${nen}.`] =
      `Chapitre ${i + 1} terminé : ${fr}. Ensuite : ${nfr}.`;
  notes[`Chapter ${i + 1} complete: ${en}. Every chapter of your journey is done.`] =
    `Chapitre ${i + 1} terminé : ${fr}. Tous les chapitres de votre parcours sont bouclés.`;
});

export const investorJourney: Record<string, string> = {
  ...notes,
  'The First Cheque': 'Le premier chèque',
  'The Track Record': 'Le palmarès',
  'The Firm': 'La société de gestion',
  'The Legacy': 'L’héritage',
  'Find a startup you believe in and back it.':
    'Trouvez une startup en laquelle vous croyez et soutenez-la.',
  'Help your companies grow and widen what you own.':
    'Aidez vos entreprises à grandir et élargissez vos participations.',
  'Invest other people’s money: fees and carry, and investors who expect returns.':
    'Investissez l’argent des autres : frais et intéressement, et des investisseurs qui attendent des rendements.',
  'Lead syndicates, back other managers and build a firm that outlasts you.':
    'Menez des syndicats, soutenez d’autres gérants et bâtissez une société qui vous survivra.',
  'Put your money and experience to work beyond your own returns.':
    'Mettez votre argent et votre expérience au service d’autre chose que vos rendements.',
  'Open the Invest app: pick a deal offer and tap Invest':
    'Ouvrez l’app Investir : choisissez une offre et touchez Investir',
  'Back {n} startups': 'Soutenir {n} startups',
  'Deal offers lists every startup raising money':
    'Les offres listent toutes les startups qui lèvent des fonds',
  'Back a company again': 'Réinvestir dans une entreprise',
  'Invest in its next round from Deal offers':
    'Investissez dans son prochain tour depuis les offres',
  'Take a board seat': 'Prendre un siège au conseil',
  'Ask for one when you offer terms': 'Demandez-en un quand vous proposez vos conditions',
  'Capital app → Allocate: advice for advisor shares':
    'App Capital → Allouer : des conseils contre des parts de conseiller',
  'Buy shares on the stock market': 'Acheter des actions en bourse',
  'Capital app → Markets': 'App Capital → Marchés',
  'Raise Fund I': 'Lever le Fonds I',
  'On Portfolio: meet the LP panel with your track record':
    'Dans Portefeuille : présentez votre palmarès au panel de LP',
  'Invest from your fund': 'Investir depuis votre fonds',
  'Pay from the fund when you offer terms':
    'Payez depuis le fonds quand vous proposez vos conditions',
  'Return money to your investors': 'Rendre de l’argent à vos investisseurs',
  'A company you backed is bought or lists':
    'Une entreprise soutenue est rachetée ou entre en bourse',
  'Portfolio → Syndicates: others invest alongside you':
    'Portefeuille → Syndicats : d’autres investissent à vos côtés',
  'Back another fund as an LP': 'Soutenir un autre fonds comme LP',
  'Portfolio → As an LP': 'Portefeuille → En tant que LP',
  'Found a firm': 'Fonder une société de gestion',
  'Portfolio → Firm: partners, a carry pool, more funds':
    'Portefeuille → Société : associés, intéressement, d’autres fonds',
  'Raise Fund II': 'Lever le Fonds II',
  'Portfolio → Your funds, once Fund I returns money':
    'Portefeuille → Vos fonds, une fois que le Fonds I rend de l’argent',
  'Capital app → Allocate → Philanthropy': 'App Capital → Allouer → Philanthropie',
  'Take a senior role at a DFI, a bank or a sovereign fund':
    'Prendre un poste de direction dans une IFD, une banque ou un fonds souverain',
  'Capital app → Allocate': 'App Capital → Allouer',
  'Start an accelerator': 'Lancer un accélérateur',
  'Portfolio → Legacy: back a cohort and run a demo day':
    'Portefeuille → Héritage : soutenez une promotion et organisez un demo day',
};
