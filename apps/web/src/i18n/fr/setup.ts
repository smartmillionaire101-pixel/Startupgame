/** Founder setup: register, fund, plan and office, and the banker's startup loan desk. */
export const setup: Record<string, string> = {
  // The tracker.
  'Idea & industry': 'Idée et secteur',
  Register: 'Immatriculer',
  'Fund it': 'Financer',
  'Plan & pitch': 'Plan et pitch',
  'Setup steps': 'Étapes de création',
  'Setup: {n} of 5 done': 'Création : {n} sur 5 faites',
  'Setup progress': 'Avancement de la création',
  '{company} · {industry} · {city}': '{company} · {industry} · {city}',
  'Next: pick an idea at the café, or name your company below.':
    'Ensuite : choisissez une idée au café, ou nommez votre entreprise ci-dessous.',
  'Next: pick the company type and pay the registry fee ({fee}). Takes {h}h.':
    'Ensuite : choisissez la forme de l’entreprise et payez les frais d’immatriculation ({fee}). Compte {h} h.',
  'Next: put money in. Your own, a scheme or a startup loan.':
    'Ensuite : apportez de l’argent. Le vôtre, un programme ou un prêt de création.',
  'Next: lenders read your plan. Then choose an office.':
    'Ensuite : les prêteurs lisent votre plan. Puis choisissez un bureau.',
  'Next: where will you work? Rent starts when you choose.':
    'Ensuite : où allez-vous travailler ? Le loyer commence quand vous choisissez.',
  '1 · Idea & industry': '1 · Idée et secteur',
  'Name it and say what it does. Registering and funding come next, one step at a time.':
    'Nommez-la et dites ce qu’elle fait. L’immatriculation et le financement viennent ensuite, une étape à la fois.',
  '{name}: the name is yours. Next, register it.':
    '{name} : le nom est à vous. Ensuite, immatriculez-la.',
  'Reserve the name and continue': 'Réserver le nom et continuer',

  // Step 2: register.
  '2 · Register the company': '2 · Immatriculer l’entreprise',
  'Not filed': 'Non déposé',
  'Reserved in {city}': 'Réservé à {city}',
  'Company type': 'Forme de l’entreprise',
  'Cheapest and fastest. Fine for grants, local loans and local angels.':
    'La moins chère et la plus rapide. Convient aux subventions, prêts locaux et business angels locaux.',
  'Easier for foreign investors.': 'Plus simple pour les investisseurs étrangers.',
  'What US funds expect at Series A.': 'Ce que les fonds américains attendent en série A.',
  '+{n}% investor appeal': '+{n} % d’attrait pour les investisseurs',
  'one-off': 'une fois',
  'Fee vs savings': 'Frais et épargne',
  'The fee is {pct}% of your savings ({savings}).':
    'Les frais représentent {pct} % de votre épargne ({savings}).',
  'Investors later': 'Investisseurs plus tard',
  'A US holding adds appeal at Series A; you can re-register later for the difference.':
    'Une holding américaine plaît en série A ; vous pourrez changer plus tard en payant la différence.',
  'From your savings': 'Sur votre épargne',
  'Register {company} ({fee})': 'Immatriculer {company} ({fee})',
  local: 'locale',
  'US holding': 'holding américaine',

  // Step 3: fund.
  '3a · Your own money': '3a · Votre propre argent',
  'of {savings} savings · {pct}%': 'sur {savings} d’épargne · {pct} %',
  '½ of savings': '½ de l’épargne',
  'How you put it in': 'Comment vous l’apportez',
  'As shares (equity)': 'En actions (capital)',
  'As a loan to the company': 'En prêt à l’entreprise',
  'You keep {keep}: {n} months of living costs ({cost} a month).':
    'Vous gardez {keep} : {n} mois de dépenses de vie ({cost} par mois).',
  'In the company so far: {equity} as shares, {loan} as a loan.':
    'Dans l’entreprise jusqu’ici : {equity} en actions, {loan} en prêt.',
  '{amount} is in {company}.': '{amount} est dans {company}.',
  'Put {amount} into {company}': 'Apporter {amount} à {company}',
  'Applied.': 'Candidature envoyée.',
  '3b · Startup schemes': '3b · Programmes pour startups',
  '{city} · decided at month end': '{city} · décision en fin de mois',
  'Accelerator · {seats} seats': 'Accélérateur · {seats} places',
  'Applied: the answer comes at month end.': 'Candidature envoyée : réponse en fin de mois.',
  'You can apply now.': 'Vous pouvez postuler maintenant.',
  'for {pct}% (SAFE)': 'pour {pct} % (SAFE)',
  '{partner} · no equity': '{partner} · sans capital',
  'Awarded.': 'Accordée.',
  grant: 'subvention',
  '3c · Startup loans': '3c · Prêts de création',
  'Your credit score: {score} · {defaults} defaults':
    'Votre score de crédit : {score} · {defaults} défauts',
  'City banks': 'Banques de la ville',
  'You qualify. Decided on your plan.': 'Vous êtes éligible. Décision sur votre plan.',
  'up to {amount}': 'jusqu’à {amount}',
  Picked: 'Choisi',
  Pick: 'Choisir',
  'Banks run by players': 'Banques tenues par des joueurs',
  'Startup loan': 'Prêt de création',
  'Player bank': 'Banque de joueur',
  '{bank} · run by {owner}': '{bank} · tenue par {owner}',
  '{owner} reads your plan and decides. They can counter.':
    '{owner} lit votre plan et décide. Une contre-offre est possible.',
  'Term (months)': 'Durée (mois)',
  '{amount} a month': '{amount} par mois',
  'Repayment vs costs': 'Remboursement et dépenses',
  'Repayments are {pct}% of what you spend each month.':
    'Les remboursements font {pct} % de ce que vous dépensez chaque mois.',
  'Borrowing before customers': 'Emprunter avant d’avoir des clients',
  'Lenders will ask how you pay this back with no customers yet: the plan in step 4.':
    'Les prêteurs demanderont comment vous remboursez sans clients : c’est le plan de l’étape 4.',
  'Runway estimate': 'Estimation de la trésorerie',
  '{n} mo goal': 'objectif {n} mois',
  'Going out each month': 'Sorties chaque mois',
  '{short} months short of {goal}: put more in, add a loan or spend less.':
    'Il manque {short} mois pour atteindre {goal} : apportez plus, ajoutez un prêt ou dépensez moins.',
  'Enough for the first year at these costs.': 'Assez pour la première année à ce rythme.',
  'Costs: the cheapest office, the cloud bill and loan repayments (or your plan’s monthly costs, if higher). Nothing is paid until you choose an office.':
    'Dépenses : le bureau le moins cher, le cloud et les remboursements (ou les dépenses mensuelles de votre plan, si plus élevées). Rien n’est payé avant le choix d’un bureau.',
  'Next: write the plan for the loan': 'Ensuite : rédiger le plan pour le prêt',
  'Write a business plan (for loans)': 'Rédiger un business plan (pour les prêts)',
  'Next: choose an office': 'Ensuite : choisir un bureau',
  'Put money into the company first.': 'Apportez d’abord de l’argent à l’entreprise.',
  'Back to funding': 'Retour au financement',

  // Step 4: the plan.
  '4 · Business plan': '4 · Business plan',
  'For: {lender}': 'Pour : {lender}',
  'Lenders and banks read the same plan. The checks update as you type.':
    'Prêteurs et banques lisent le même plan. Les contrôles se mettent à jour pendant la saisie.',
  'What you sell': 'Ce que vous vendez',
  'To whom': 'À qui',
  'Price / month': 'Prix / mois',
  'Cost to serve': 'Coût de service',
  'Customers, month 6': 'Clients, mois 6',
  'The ask': 'La demande',
  'Months it lasts': 'Mois de trésorerie',
  'Send the updated plan': 'Envoyer le plan mis à jour',
  'Fix the red check to send.': 'Corrigez le contrôle rouge pour envoyer.',
  'Send the plan to this lender too': 'Envoyer aussi le plan à ce prêteur',
  'Sent.': 'Envoyé.',
  'Price vs what they pay': 'Prix et budget des clients',
  Margin: 'Marge',
  'Break-even': 'Point mort',
  'Customer understanding': 'Connaissance du client',
  Repayment: 'Remboursement',
  'Customers spend up to {budget} a month on tools like this; {price} is well over it.':
    'Les clients dépensent jusqu’à {budget} par mois pour ce genre d’outil ; {price}, c’est bien au-dessus.',
  'Customers spend up to {budget} a month on tools like this; you ask {price}.':
    'Les clients dépensent jusqu’à {budget} par mois pour ce genre d’outil ; vous demandez {price}.',
  'You keep {margin} of every {price}.': 'Vous gardez {margin} sur chaque {price}.',
  'Each customer costs more to serve than they pay.':
    'Chaque client coûte plus à servir qu’il ne paie.',
  'You need {need} paying customers to cover {costs} a month; the plan has {plan} by month 6.':
    'Il faut {need} clients payants pour couvrir {costs} par mois ; le plan en prévoit {plan} au mois 6.',
  'At these costs the money doesn’t run out.': 'À ce rythme, l’argent ne s’épuise pas.',
  'Your money plus the ask lasts {real} months; you say {claimed}.':
    'Votre argent plus la demande tient {real} mois ; vous annoncez {claimed}.',
  'Your money plus the ask lasts {real} months, not {claimed}. Say {say}, or ask {ask}.':
    'Votre argent plus la demande tient {real} mois, pas {claimed}. Annoncez {say}, ou demandez {ask}.',
  'You know what your customers need ({have}%).':
    'Vous savez ce dont vos clients ont besoin ({have} %).',
  'You have spoken to few customers. Lenders like {need}%+ before lending.':
    'Vous avez parlé à peu de clients. Les prêteurs aiment {need} % ou plus avant de prêter.',
  'No loan repayments.': 'Aucun remboursement de prêt.',
  'Loan repayments are {pay} a month: {pct}% of monthly costs.':
    'Les remboursements font {pay} par mois : {pct} % des dépenses mensuelles.',
  'Fix: price nearer what customers pay ({budget}).':
    'Solution : un prix plus proche du budget des clients ({budget}).',
  'Fix: cut the cost to serve or raise the price.':
    'Solution : réduisez le coût de service ou augmentez le prix.',
  'Fix: the rest comes at {n} paying customers.':
    'Solution : le reste arrive à {n} clients payants.',
  'Fix: plan more customers or lower the monthly costs.':
    'Solution : prévoyez plus de clients ou baissez les dépenses mensuelles.',
  'Fix: say {say} months, or ask for {ask}.': 'Solution : annoncez {say} mois, ou demandez {ask}.',
  'Fix: interview customers (Company → Sales, discovery meetings).':
    'Solution : interrogez des clients (Entreprise → Ventes, rendez-vous de découverte).',
  'Fix: borrow less, or over a longer term.': 'Solution : empruntez moins, ou sur plus longtemps.',

  // The answers.
  'The answers': 'Les réponses',
  Approved: 'Accordé',
  'Approved with conditions': 'Accordé sous conditions',
  '{lender} · {product}': '{lender} · {product}',
  '{n}/100': '{n}/100',
  '{rate}% · {n} months': '{rate} % · {n} mois',
  '{rest} after {n} customers': '{rest} après {n} clients',
  'Score {n}/100. Approve from 70; with conditions from 55.':
    'Score {n}/100. Accord à partir de 70 ; sous conditions à partir de 55.',
  'Accept {amount}': 'Accepter {amount}',
  'Accepted: the money is in.': 'Accepté : l’argent est arrivé.',
  'Taken: {amount} is in the company.': 'Pris : {amount} est dans l’entreprise.',
  'Fix the plan and ask again next month.': 'Corrigez le plan et redemandez le mois prochain.',
  'Waiting for the banker': 'En attente du banquier',
  '{bank} · startup loan': '{bank} · prêt de création',
  '{amount} over {n} months at {rate}%{guarantee}.': '{amount} sur {n} mois à {rate} %{guarantee}.',
  ', with your personal guarantee': ', avec votre caution personnelle',
  'The banker reads your plan. No answer by month {n} and it lapses; you can withdraw it any time.':
    'Le banquier lit votre plan. Sans réponse au mois {n}, la demande expire ; vous pouvez la retirer à tout moment.',
  'Accept the counter': 'Accepter la contre-offre',
  'No customers yet': 'Pas encore de clients',
  'Repayment too high': 'Remboursement trop élevé',
  'Thin plan': 'Plan trop léger',
  'Credit record': 'Historique de crédit',
  'Bank capital': 'Capital de la banque',

  // Step 5: the office.
  '5 · Where will you work?': '5 · Où allez-vous travailler ?',
  Offices: 'Bureaux',
  'Work from home': 'Travailler de chez soi',
  'Co-working desks': 'Postes en coworking',
  'Small office': 'Petit bureau',
  'Shop-front': 'Boutique sur rue',
  'Serviced office': 'Bureau équipé',
  'No room to hire': 'Pas de place pour embaucher',
  'Engineers nearby': 'Ingénieurs à proximité',
  'Customers nearby': 'Clients à proximité',
  Noisy: 'Bruyant',
  'Funds & banks nearby': 'Fonds et banques à proximité',
  'no lease': 'sans bail',
  'month-to-month': 'au mois',
  '{n}-month lease': 'bail de {n} mois',
  '{desks} desks · {size} m² · {lease}': '{desks} postes · {size} m² · {lease}',
  '{desks} desks · {lease}': '{desks} postes · {lease}',
  'Runway {from} → {to} months': 'Trésorerie {from} → {to} mois',
  'Rent vs costs': 'Loyer et dépenses',
  '{office} is {pct}% of your monthly costs.':
    '{office} représente {pct} % de vos dépenses mensuelles.',
  Commute: 'Trajet',
  '{n} min each way: about {h}h a month on the road.':
    '{n} min chaque trajet : environ {h} h par mois sur la route.',
  'No commute.': 'Aucun trajet.',
  'Work from home for now': 'Travailler de chez soi pour l’instant',
  'Lease {desks} desks in {district} ({rent}/month)':
    'Louer {desks} postes à {district} ({rent}/mois)',

  // Done.
  '{company} is open': '{company} est ouverte',
  'Setup: 5 of 5 done': 'Création : 5 sur 5 faites',
  'Idea: {idea}': 'Idée : {idea}',
  'Registered: {company} ({type})': 'Immatriculée : {company} ({type})',
  'Funded: your {own} + loans {loans}': 'Financée : vos {own} + prêts {loans}',
  'Funded: your {own}': 'Financée : vos {own}',
  'Plan sent': 'Plan envoyé',
  'Working from home': 'Travail depuis chez soi',
  '{desks} desks, {district}': '{desks} postes, {district}',
  '{rent}/mo': '{rent}/mois',
  '{n} months · goal {goal}': '{n} mois · objectif {goal}',
  'Next: customer interviews, first sales and hiring. Your stage tracker below shows what to do first.':
    'Ensuite : entretiens clients, premières ventes et embauches. Le suivi d’étape ci-dessous montre par quoi commencer.',

  // The banker's desk.
  'Startup loan applications': 'Demandes de prêt de création',
  'Startup loan · arrived month {n} · answer by month {due}':
    'Prêt de création · reçu au mois {n} · réponse avant le mois {due}',
  Countered: 'Contre-offre envoyée',
  'Founder · {industry} · credit score {score}, {defaults} defaults':
    'Fondateur · {industry} · score de crédit {score}, {defaults} défauts',
  Asks: 'Demande',
  'Your rate': 'Votre taux',
  'Their plan': 'Leur plan',
  '{price}/month, {cost} to serve. Costs {costs}/month. {n} customers by month 6. Own money in: {own}.':
    '{price}/mois, {cost} de coût de service. Dépenses {costs}/mois. {n} clients au mois 6. Apport personnel : {own}.',
  'Also approved: {lenders}.': 'Aussi accordé : {lenders}.',
  'Repayment vs their costs': 'Remboursement et leurs dépenses',
  'Founder credit': 'Crédit du fondateur',
  'Your capital ratio after': 'Votre ratio de capital après',
  'Single borrower': 'Emprunteur unique',
  '{pay} on top of {costs}: {pct}% of what they spend.':
    '{pay} en plus de {costs} : {pct} % de ce qu’ils dépensent.',
  '{paying} paying today; break-even at {need}.':
    '{paying} payants aujourd’hui ; point mort à {need}.',
  'Score {score}, {defaults} defaults; own money at risk.':
    'Score {score}, {defaults} défauts ; apport personnel en jeu.',
  '{after}% with this loan (minimum {min}%).': '{after} % avec ce prêt (minimum {min} %).',
  '{pct}% of your capital.': '{pct} % de votre capital.',
  'Interest you’d earn': 'Intérêts que vous gagneriez',
  '{amount} over {n} months': '{amount} sur {n} mois',
  'Your counter': 'Votre contre-offre',
  'Rate (%)': 'Taux (%)',
  '{pay} a month: {pct}% of their costs.': '{pay} par mois : {pct} % de leurs dépenses.',
  'Decline reasons, if you decline:': 'Motifs de refus, si vous refusez :',
  'Decline reason': 'Motif de refus',
  'Approve {amount}': 'Accorder {amount}',
  'Approved: the loan is paid out.': 'Accordé : le prêt est versé.',
  'Waiting for the founder to answer your counter.':
    'En attente de la réponse du fondateur à votre contre-offre.',

  // The first session's coach.
  '{company} has no money in it yet: register and fund it on the Company screen.':
    '{company} n’a pas encore d’argent : immatriculez-la et financez-la sur l’écran Entreprise.',

  'Before the first customer: register {company} and put money in. Sales meetings and demos are paid from the business account.':
    'Avant le premier client : immatriculez {company} et apportez de l’argent. Les rendez-vous et démos se paient depuis le compte de l’entreprise.',

  // Engine messages (exact text).
  'Plan ready: lenders and banks read it when you ask.':
    'Plan prêt : prêteurs et banques le lisent quand vous demandez.',
  'Fix the red checks before you send the plan.':
    'Corrigez les contrôles rouges avant d’envoyer le plan.',
  'Write the business plan first: lenders read it.':
    'Rédigez d’abord le business plan : les prêteurs le lisent.',
  'Write the business plan first: the banker reads it.':
    'Rédigez d’abord le business plan : le banquier le lit.',
  'Put money into the company first: your own, a scheme or a loan.':
    'Apportez d’abord de l’argent à l’entreprise : le vôtre, un programme ou un prêt.',
  'Register the company first.': 'Immatriculez d’abord l’entreprise.',
  'Fund the company first, then choose an office.':
    'Financez d’abord l’entreprise, puis choisissez un bureau.',
  'Pick one of the offices on offer.': 'Choisissez un des bureaux proposés.',
  'Pick who the plan is for.': 'Choisissez à qui s’adresse le plan.',
};
