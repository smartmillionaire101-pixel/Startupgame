/** Founder Journey 4a: decision events (Today), their choices, and the rivals panel (Company). */
export const decisions: Record<string, string> = {
  // ---- the inbox and the sheet
  Decisions: 'Décisions',
  '{n} waiting for you': '{n} en attente',
  'Nothing waiting': 'Rien en attente',
  '{n} decisions waiting': '{n} décisions en attente',
  'Recent decisions': 'Décisions récentes',
  'Decided for you: {choice}': 'Décidé pour vous : {choice}',
  'You chose: {choice}': 'Votre choix : {choice}',
  'Decided: {choice}': 'Décidé : {choice}',
  'It worked out.': 'Ça a marché.',
  'It didn’t work out.': 'Ça n’a pas marché.',
  'Decide this month': 'À décider ce mois-ci',
  '{n} months to decide': '{n} mois pour décider',
  'If you don’t decide': 'Si vous ne décidez pas',
  'If it doesn’t work out:': 'Si ça ne marche pas :',
  'Choose this': 'Choisir',
  'No cost, nothing changes.': 'Aucun coût, rien ne change.',
  Life: 'Vie',
  // ---- consequences
  'Costs the company {amount}': 'Coûte {amount} à l’entreprise',
  'Costs you {amount}': 'Vous coûte {amount}',
  'Takes {n}h of your time this month': 'Prend {n} h de votre temps ce mois-ci',
  '{name}’s morale {n}': 'Moral de {name} {n}',
  'Team morale {n}': 'Moral de l’équipe {n}',
  'Your rating {n}': 'Votre note {n}',
  'Your price {n}%': 'Votre prix {n} %',
  'Marketing budget {n}%': 'Budget marketing {n} %',
  '{name}’s salary becomes {amount} a month': 'Le salaire de {name} passe à {amount} par mois',
  '{name} leaves the team': '{name} quitte l’équipe',
  'Joins your sales pipeline at {stage}': 'Entre dans votre pipeline à l’étape {stage}',
  'Joins your sales pipeline at {stage}, {n}% off':
    'Entre dans votre pipeline à l’étape {stage}, avec {n} % de remise',
  '{n}% more off the deal': '{n} % de remise en plus sur l’affaire',
  'Their trust in you {n}': 'Leur confiance en vous {n}',
  'Product fit {n}': 'Adéquation produit {n}',
  'Quality {n}': 'Qualité {n}',
  'Tech debt {n}': 'Dette technique {n}',
  'Rivals stop weighing on your deals for {n} months':
    'Les concurrents ne pèsent plus sur vos affaires pendant {n} mois',
  'Closer to {name}': 'Plus proche de {name}',
  '{name} is a little hurt': '{name} est un peu vexé·e',
  'Social {n}': 'Vie sociale {n}',
  'Network {n}': 'Réseau {n}',
  'You lend the company {amount} (it owes you)':
    'Vous prêtez {amount} à l’entreprise (elle vous le doit)',
  '{amount} comes in now ({fee} fee)': '{amount} arrivent maintenant ({fee} de frais)',
  '{amount} comes in now': '{amount} arrivent maintenant',
  'Posts a {role} job ({amount})': 'Publie une offre de {role} ({amount})',
  '{n}% chance it works out': '{n} % de chances que ça marche',
  'Win chances about {n} points lower while it lasts':
    'Chances de signer environ {n} points plus basses tant que ça dure',
  // ---- roles and features (in sentences)
  engineer: 'ingénieur·e',
  'product manager': 'chef·fe de produit',
  salesperson: 'commercial·e',
  marketer: 'marketeur·se',
  'support agent': 'agent·e de support',
  'operations lead': 'responsable des opérations',
  'finance lead': 'responsable financier·ère',
  'a mobile app': 'une appli mobile',
  'team accounts': 'des comptes d’équipe',
  'an analytics dashboard': 'un tableau de bord analytique',
  'an open API': 'une API ouverte',
  'offline mode': 'un mode hors ligne',
  'instant payouts': 'des paiements instantanés',
  'a merchant app': 'une appli marchands',
  'cheaper transfers': 'des transferts moins chers',
  'a savings wallet': 'un portefeuille d’épargne',
  'a free tier': 'une offre gratuite',
  integrations: 'des intégrations',
  'an AI assistant': 'un assistant IA',
  'single sign-on': 'l’authentification unique',
  // ---- titles
  'A big prospect: {customer}': 'Un gros prospect : {customer}',
  'Customers are complaining': 'Les clients se plaignent',
  'Your team is stretched': 'Votre équipe est débordée',
  '{name} asks for a raise': '{name} demande une augmentation',
  '{rival} wants {name}': '{rival} veut débaucher {name}',
  '{rival} raised money': '{rival} a levé des fonds',
  '{rival} launched something new': '{rival} a lancé une nouveauté',
  '{rival} is courting {customer}': '{rival} fait la cour à {customer}',
  'Runway is short: {months} months': 'Trésorerie courte : {months} mois',
  'Customers are paying late': 'Les clients paient en retard',
  '{friend} invites you out': '{friend} vous invite à sortir',
  'A founders’ dinner': 'Un dîner de fondateurs',
  'You’ve saved {amount}': 'Vous avez épargné {amount}',
  'Your own place': 'Chez vous',
  // ---- bodies
  '{contact} at {customer} has heard about {company}. They could pay about {budget} a month, but want a better deal or changes first.':
    '{contact}, chez {customer}, a entendu parler de {company}. Ils pourraient payer environ {budget} par mois, mais veulent d’abord un meilleur prix ou des changements.',
  'Outages and slow support at {company}: reliability is {reliability}%. {customers} paying customers are watching what you do.':
    'Pannes et support lent chez {company} : la fiabilité est de {reliability} %. {customers} clients payants attendent de voir ce que vous faites.',
  '{name} is at {workload}% of a full load and team morale is {morale}. Something has to give.':
    '{name} est à {workload} % d’une charge pleine et le moral de l’équipe est à {morale}. Il faut lâcher quelque chose.',
  '{name} ({role}) earns {salary} a month; the market rate is {band}. They want to talk.':
    '{name} ({role}) gagne {salary} par mois ; le prix du marché est de {band}. Il ou elle veut en parler.',
  '{rival} has offered {name} ({role}) a job at about {offer} a month. {name} hasn’t said yes yet.':
    '{rival} a proposé à {name} ({role}) un poste à environ {offer} par mois. {name} n’a pas encore dit oui.',
  '{rival} cut prices {pct}% after raising {amount}. Buyers comparing you will notice.':
    '{rival} a baissé ses prix de {pct} % après avoir levé {amount}. Les acheteurs qui comparent le remarqueront.',
  '{rival} cut prices {pct}%. Buyers comparing you will notice.':
    '{rival} a baissé ses prix de {pct} %. Les acheteurs qui comparent le remarqueront.',
  '{rival} raised {amount}. Expect them to hire, launch and spend on marketing.':
    '{rival} a levé {amount}. Attendez-vous à des embauches, des lancements et du marketing.',
  '{rival} launched {feature}. Some of your prospects will ask why you don’t have it.':
    '{rival} a lancé {feature}. Certains de vos prospects vous demanderont pourquoi vous ne l’avez pas.',
  'Some of your prospects will ask why you don’t have it.':
    'Certains de vos prospects vous demanderont pourquoi vous ne l’avez pas.',
  '{rival} has been talking to {customer}, one of your open deals.':
    '{rival} discute avec {customer}, une de vos affaires en cours.',
  '{company} has about {months} months of cash at this burn ({burn} a month).':
    '{company} a environ {months} mois de trésorerie à ce rythme ({burn} par mois).',
  '{receivables} of invoices are still unpaid, more than your monthly revenue.':
    '{receivables} de factures sont encore impayées, plus que votre chiffre d’affaires mensuel.',
  '{friend} is free this week and wants to catch up. You have {hours}h left this month.':
    '{friend} est libre cette semaine et veut prendre des nouvelles. Il vous reste {hours} h ce mois-ci.',
  'A few founders are meeting for dinner in {city}. Good people to know.':
    'Quelques fondateurs dînent ensemble à {city}. Des gens bons à connaître.',
  'Your personal savings passed {amount}. What do you do with it?':
    'Votre épargne personnelle a dépassé {amount}. Qu’en faites-vous ?',
  'You live in a home you own now. Friends keep asking when the housewarming is.':
    'Vous vivez maintenant chez vous. Vos amis demandent sans cesse quand aura lieu la crémaillère.',
  // ---- choices: label, then what happens
  'Offer a launch discount': 'Proposer une remise de lancement',
  'They go straight to a proposal at 15% off.':
    'Ils passent directement à une proposition à 15 % de remise.',
  'Customise it for them': 'L’adapter pour eux',
  'You build what they asked for and show them a demo.':
    'Vous construisez ce qu’ils ont demandé et leur faites une démo.',
  'Tell them to wait': 'Leur demander d’attendre',
  'They go on your pipeline as a lead.': 'Ils entrent dans votre pipeline comme prospect.',
  'Say no': 'Dire non',
  'You keep your focus. Nothing changes.': 'Vous restez concentré. Rien ne change.',
  'Drop everything and fix it': 'Tout lâcher pour réparer',
  'Less tech debt, a steadier product.': 'Moins de dette technique, un produit plus stable.',
  'Give everyone a credit': 'Offrir un avoir à tous',
  'You pay them back a little; they stay fond of you.':
    'Vous les remboursez un peu ; ils vous restent fidèles.',
  'Just apologise': 'S’excuser, simplement',
  'Free, but your rating slips a little.': 'Gratuit, mais votre note baisse un peu.',
  'Hire help': 'Recruter du renfort',
  'You post a {role} job (find candidates on the Team tab).':
    'Vous publiez une offre de {role} (trouvez des candidats dans l’onglet Équipe).',
  'Pause the less important work': 'Mettre en pause le moins important',
  'The team breathes; the product moves a little slower.':
    'L’équipe respire ; le produit avance un peu moins vite.',
  'Thank them with a bonus': 'Les remercier avec une prime',
  'A bonus paid through payroll lifts morale.': 'Une prime versée sur la paie remonte le moral.',
  'Push on': 'Continuer comme ça',
  'Nothing changes, and morale dips.': 'Rien ne change, et le moral baisse.',
  'Pay the market rate': 'Payer le prix du marché',
  'Their salary goes up every month from now.': 'Son salaire augmente chaque mois désormais.',
  'One-off bonus instead': 'Une prime unique à la place',
  'Half a month’s pay now; their salary stays.':
    'Un demi-mois de salaire maintenant ; le salaire ne change pas.',
  'Not now': 'Pas maintenant',
  'Free, but they’re disappointed.': 'Gratuit, mais c’est une déception.',
  'Counter-offer': 'Faire une contre-offre',
  'You raise their pay; they stay.': 'Vous augmentez son salaire ; il ou elle reste.',
  'Talk to them about the mission': 'Lui parler de la mission',
  'Most stay after a real conversation.': 'La plupart restent après une vraie discussion.',
  'Wish them well': 'Lui souhaiter bonne chance',
  'They leave; you save their salary.': 'Il ou elle part ; vous économisez son salaire.',
  'Leave it to them': 'Le ou la laisser décider',
  'Free. It’s a coin toss whether they stay.': 'Gratuit. Une chance sur deux qu’il ou elle reste.',
  'Cut your price too': 'Baisser votre prix aussi',
  'You stay close on price; every customer pays a little less.':
    'Vous restez proche sur le prix ; chaque client paie un peu moins.',
  'Sell on quality instead': 'Miser plutôt sur la qualité',
  'You show buyers what’s better; their cut stops hurting you for a while.':
    'Vous montrez ce qui est meilleur ; leur baisse ne vous pénalise plus pendant un temps.',
  'Partner with a bigger brand': 'S’associer à une grande marque',
  'A co-marketing deal that lends you their name.':
    'Un accord de co-marketing qui vous prête leur nom.',
  'Hold your price': 'Garder votre prix',
  'Free. Their cut weighs a little on your win chances while it lasts.':
    'Gratuit. Leur baisse pèse un peu sur vos chances de signer tant qu’elle dure.',
  'Ship faster with contractors': 'Livrer plus vite avec des prestataires',
  'A better product, sooner.': 'Un meilleur produit, plus tôt.',
  'Double down on your best customers': 'Miser sur vos meilleurs clients',
  'You go deeper where you already win.': 'Vous creusez là où vous gagnez déjà.',
  'Stay the course': 'Garder le cap',
  'Free. You keep doing what works.': 'Gratuit. Vous continuez ce qui marche.',
  'Build your answer': 'Construire votre réponse',
  'Your product closes the gap.': 'Votre produit rattrape son retard.',
  'Be the cheaper option': 'Être l’option la moins chère',
  'A small price cut instead of a race.': 'Une petite baisse de prix plutôt qu’une course.',
  'Ignore it': 'L’ignorer',
  'Free. If their product pulls ahead, it weighs a little on your deals.':
    'Gratuit. Si leur produit prend de l’avance, ça pèse un peu sur vos affaires.',
  'Sweeten your offer': 'Améliorer votre offre',
  '10% more off your deal with them.': '10 % de remise en plus sur votre affaire avec eux.',
  'Go and see them': 'Aller les voir',
  'Face time builds their trust in you.': 'Les voir en personne renforce leur confiance.',
  'Let it ride': 'Laisser faire',
  'Free. Their trust in you slips a little.': 'Gratuit. Leur confiance en vous baisse un peu.',
  'Halve marketing': 'Diviser le marketing par deux',
  'Burn drops; fewer new customers find you.':
    'Les dépenses baissent ; moins de nouveaux clients vous trouvent.',
  'Collect invoices early': 'Encaisser les factures en avance',
  'A finance house pays your invoices now, minus a fee.':
    'Une société d’affacturage paie vos factures maintenant, moins des frais.',
  'Lend the company money': 'Prêter de l’argent à l’entreprise',
  'From your personal account; the company owes it back.':
    'Depuis votre compte personnel ; l’entreprise vous le doit.',
  'Plan a raise': 'Préparer une levée',
  'No cost now: open a round from the Money tab.':
    'Aucun coût maintenant : ouvrez une levée depuis l’onglet Argent.',
  'Chase them yourself': 'Les relancer vous-même',
  'About a third comes in now.': 'Environ un tiers arrive maintenant.',
  'Sell the invoices': 'Vendre les factures',
  'All of it now, minus a fee.': 'Tout maintenant, moins des frais.',
  'Wait for the due dates': 'Attendre les échéances',
  'Free. The money comes when it’s due.': 'Gratuit. L’argent arrive à l’échéance.',
  'A good evening: you feel better and get closer.':
    'Une bonne soirée : vous vous sentez mieux et vous rapprochez.',
  'Suggest another time': 'Proposer un autre moment',
  'Free. No harm done.': 'Gratuit. Aucun mal.',
  'Say you’re too busy': 'Dire que vous êtes trop occupé',
  'Free, but it stings a little.': 'Gratuit, mais ça pique un peu.',
  'Go along': 'Y aller',
  'You meet people who might help later.':
    'Vous rencontrez des gens qui pourraient aider plus tard.',
  'Skip it': 'Passer',
  'Free. Another time.': 'Gratuit. Une autre fois.',
  'Take a weekend away': 'Partir en week-end',
  'You come back rested.': 'Vous revenez reposé.',
  'Back your own company': 'Soutenir votre entreprise',
  'A founder loan: the company owes it back.': 'Un prêt de fondateur : l’entreprise vous le doit.',
  'Keep it saved': 'Garder l’épargne',
  'Free. The money stays where it is.': 'Gratuit. L’argent reste où il est.',
  'Throw a housewarming': 'Pendre la crémaillère',
  'Friends, food and new faces.': 'Des amis, à manger et de nouvelles têtes.',
  'Maybe later': 'Peut-être plus tard',
  'Free.': 'Gratuit.',
  // ---- the rivals panel
  Rivals: 'Concurrents',
  'Who you compete with in {city}': 'Contre qui vous jouez à {city}',
  'Your response holds rivals off until month {m}.':
    'Votre réponse tient les concurrents à distance jusqu’au mois {m}.',
  'Rivals are taking about {n} points off your win chances right now.':
    'Les concurrents vous coûtent environ {n} points de chances de signer en ce moment.',
  'No rival is hurting your deals right now.':
    'Aucun concurrent ne pénalise vos affaires en ce moment.',
  '{n}% price cut': 'Prix −{n} %',
  'Competes on price': 'Se bat sur le prix',
  'Competes on product': 'Se bat sur le produit',
  'Competes on sales': 'Se bat sur la vente',
  'Wants growth': 'Vise la croissance',
  'Wants profit': 'Vise la rentabilité',
  'Wants to dominate': 'Veut dominer',
  'Raised {amount}': 'A levé {amount}',
  '{n}★': '{n} ★',
  'Product {n}': 'Produit {n}',
  'Price {n} of what buyers spend': 'Prix : {n} de ce que dépensent les acheteurs',
  'M{m}': 'M{m}',
  '{rival} raised {amount}': '{rival} a levé {amount}',
  '{rival} cut prices {pct}% after raising {amount}':
    '{rival} a baissé ses prix de {pct} % après avoir levé {amount}',
  '{rival} cut prices {pct}%': '{rival} a baissé ses prix de {pct} %',
  '{rival} launched {feature}': '{rival} a lancé {feature}',
  '{rival} tried to hire someone from your team':
    '{rival} a tenté de débaucher quelqu’un de votre équipe',
  '{rival} is courting one of your prospects': '{rival} courtise un de vos prospects',
  '{rival} won a contract with {customer}': '{rival} a signé un contrat avec {customer}',
  '{rival} shut down': '{rival} a fermé',
};
