/** The investor career: the ladder, the first session, prompts (and the engine's messages). */
export const investorCareer: Record<string, string> = {
  // ---- rungs
  'Syndicate lead': 'Chef de file de syndicat',
  'Emerging manager': 'Gérant émergent',
  'Fund manager': 'Gérant de fonds',
  'Established GP': 'Commandité confirmé',
  'Firm founder': 'Fondateur de société de gestion',
  Allocator: 'Allocataire',
  'Institution leader': 'Dirigeant d’institution',
  'Angel cheques, deal flow, diligence and the stock market.':
    'Tickets d’ange, flux d’affaires, due diligence et la Bourse.',
  'Lead syndicates: bring backers into your deals and earn deal-by-deal carry.':
    'Menez des syndicats : faites entrer des co-investisseurs et touchez un carried interest par opération.',
  'Raise Fund I from AI and player LPs.': 'Levez le Fonds I auprès de LP IA et de joueurs.',
  'A management fee every month, reserves, an investment committee and LP letters.':
    'Des frais de gestion chaque mois, des réserves, un comité d’investissement et des lettres aux LP.',
  'Raise Fund II and strategy funds on the cash you returned.':
    'Levez le Fonds II et des fonds thématiques grâce à l’argent rendu.',
  'A firm: partners and associates, a carry pool and several funds at once.':
    'Une société de gestion : associés et chargés d’affaires, un pool de carried et plusieurs fonds à la fois.',
  'Commit to other funds as an LP, a family office and a fund of funds.':
    'Engagez-vous comme LP dans d’autres fonds, un family office et un fonds de fonds.',
  'Run an institution’s balance sheet: a senior salary and a mandate.':
    'Gérez le bilan d’une institution : un salaire de dirigeant et un mandat.',
  // ---- requirements
  'Be an investor': 'Être investisseur',
  'Deals (syndicates count)': 'Opérations (les syndicats comptent)',
  'Investor stars': 'Étoiles d’investisseur',
  'LP panel score': 'Note du comité de LP',
  'Close Fund I': 'Clôturer le Fonds I',
  'Cash returned (DPI)': 'Argent rendu (DPI)',
  'LPs who would re-up': 'LP prêts à réinvestir',
  'Funds raised': 'Fonds levés',
  'Partners or associates hired': 'Associés ou chargés d’affaires recrutés',
  'Liquid wealth (60 months of living costs)': 'Patrimoine liquide (60 mois de dépenses courantes)',
  'A senior role at a DFI or bank': 'Un poste de direction dans une IFD ou une banque',
  // ---- the ladder card
  'Your investor career': 'Votre carrière d’investisseur',
  'Grow as an investor': 'Progresser comme investisseur',
  'Angel is the first rung, not the last': 'Business angel : le premier échelon, pas le dernier',
  Less: 'Moins',
  'All rungs': 'Tous les échelons',
  '{name} would like to co-lead your first syndicate: they’ll match your cheque.':
    '{name} aimerait co-mener votre premier syndicat : même montant que votre ticket.',
  '{name} offers to anchor your Fund I with {amount}.':
    '{name} propose d’être investisseur d’ancrage de votre Fonds I avec {amount}.',
  Pinned: 'Épinglé',
  'Largest angel cheque': 'Plus gros ticket d’ange',
  '{share} of liquid net worth': '{share} du patrimoine net liquide',
  Investable: 'Investissable',
  'Savings less six months of living costs': 'Épargne moins six mois de dépenses courantes',
  '{stages} rounds need a lead: a syndicate or a fund.':
    'Les tours {stages} exigent un chef de file : un syndicat ou un fonds.',
  'You can commit to other funds as an LP.':
    'Vous pouvez vous engager comme LP dans d’autres fonds.',
  'LP commitments open at {amount} of liquid wealth.':
    'Les engagements de LP s’ouvrent à {amount} de patrimoine liquide.',
  // ---- prompts
  'Finish your first session': 'Terminez votre première session',
  'Become a {rung}: {step}': 'Devenir {rung} : {step}',
  'almost there': 'presque',
  'Go to {name}': 'Aller à {name}',
  'Judge {name}': 'Être juré de {name}',
  'See who is raising this month': 'Voir qui lève des fonds ce mois-ci',
  'Dinner with {name}': 'Dîner avec {name}',
  'Coffee in the Investor Quarter': 'Un café dans le quartier des investisseurs',
  // ---- the first session
  'Your profile and thesis': 'Votre profil et votre thèse',
  'What you can invest': 'Ce que vous pouvez investir',
  'Three startups at the café': 'Trois startups au café',
  'A first call': 'Un premier appel',
  'A small SAFE': 'Un petit SAFE',
  'Your portfolio': 'Votre portefeuille',
  'The ladder': 'L’échelle',
  'First session · step {n} of {total}': 'Première session · étape {n} sur {total}',
  'Skipped. Your profile and thesis are saved.':
    'Passé. Votre profil et votre thèse sont enregistrés.',
  Steps: 'Étapes',
  'Kept for living costs': 'Gardé pour vivre',
  '{n} months: never invest the rent': '{n} mois : n’investissez jamais le loyer',
  'Suggested first cheque': 'Premier ticket suggéré',
  'At most a tenth of what you can invest': 'Au plus un dixième de ce que vous pouvez investir',
  'Now meet some founders.': 'Maintenant, rencontrez des fondateurs.',
  'An angel at the café shows you three startups looking for money. Pick one to look at closely.':
    'Au café, un business angel vous présente trois startups qui cherchent de l’argent. Choisissez-en une à examiner de près.',
  'Fits your thesis': 'Correspond à votre thèse',
  'Shortlisted {name}.': '{name} présélectionnée.',
  Shortlist: 'Présélectionner',
  'A first call costs 4 hours and unlocks revenue, customers and burn. Information is earned, not given.':
    'Un premier appel coûte 4 heures et débloque le chiffre d’affaires, les clients et les dépenses. L’information se mérite.',
  'First call with {name} (4h)': 'Premier appel avec {name} (4 h)',
  'A SAFE turns into shares at the next priced round, at most at its valuation cap. Your ownership is about the amount divided by the cap.':
    'Un SAFE se convertit en actions au prochain tour valorisé, au plus à son plafond de valorisation. Votre part vaut environ le montant divisé par le plafond.',
  About: 'Environ',
  'of the company': 'de l’entreprise',
  'Send the SAFE (2h)': 'Envoyer le SAFE (2 h)',
  'Picked the second startup.': 'Deuxième startup choisie.',
  'Pick the second startup': 'Choisir la deuxième startup',
  'Your first position is below: cost, ownership and the mark. The mark is paper, not cash: only a sale, a secondary or an IPO pays you.':
    'Votre première position est ci-dessous : coût, part et valorisation. La valorisation est sur le papier : seule une vente, un secondaire ou une introduction en Bourse vous paie.',
  'One more thing: the ladder.': 'Une dernière chose : l’échelle.',
  'Angel is the first rung. Lead a syndicate next, then raise Fund I. The stock market and LP commitments are other places for your money.':
    'Business angel est le premier échelon. Menez ensuite un syndicat, puis levez le Fonds I. La Bourse et les engagements de LP sont d’autres placements.',
  'First session done. Next rung pinned.': 'Première session terminée. Prochain échelon épinglé.',
  'Pin my next rung': 'Épingler mon prochain échelon',
  // ---- the engine's messages
  'Skipped. Nothing was invested.': 'Passé. Rien n’a été investi.',
  'Declined. The offer is closed.': 'Refusé. L’offre est close.',
  'Pick one of the three startups first.': 'Choisissez d’abord l’une des trois startups.',
  'Do a first call with the startup you picked.':
    'Faites un premier appel avec la startup choisie.',
  'Send them a small SAFE first.': 'Envoyez-leur d’abord un petit SAFE.',
  'You’ve finished the first session.': 'Vous avez terminé la première session.',
  'They passed on price: your cap was below what they think they’re worth. Offer the suggested cap, or pick the second startup.':
    'Ils ont refusé pour le prix : votre plafond était sous leur valeur estimée. Proposez le plafond suggéré, ou choisissez la deuxième startup.',
};
