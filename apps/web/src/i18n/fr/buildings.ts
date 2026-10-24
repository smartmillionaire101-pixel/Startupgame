/** Item 13: something to do in every building (errands, civic services, crowds). */
export const buildings: Record<string, string> = {
  // ---- The tray and the cards (client)
  'Your vote is in: {pct}% of responses so far back the proposal.':
    'Votre vote est enregistré : {pct} % des réponses soutiennent la proposition pour l’instant.',
  'The policy rate is {rate}%. You read the money markets better.':
    'Le taux directeur est de {rate} %. Vous comprenez mieux les marchés monétaires.',
  'New leads in your pipeline: {names}.': 'Nouveaux prospects dans votre pipeline : {names}.',
  'You met people worth knowing.': 'Vous avez rencontré des gens qui valent le détour.',
  'Lesson: {lesson}': 'Leçon : {lesson}',
  'Your personal filings are in order.': 'Vos déclarations personnelles sont en ordre.',
  '{company} is registered for tax and its filings are up to date.':
    '{company} est immatriculée aux impôts et ses déclarations sont à jour.',
  '{company} isn’t registered for tax yet: register here first.':
    '{company} n’est pas encore immatriculée aux impôts : commencez par l’immatriculer ici.',
  'You met {names}.': 'Vous avez rencontré {names}.',
  'Nobody new this time.': 'Personne de nouveau cette fois.',
  'Other founders went through what you’re building.':
    'D’autres fondateurs ont passé en revue ce que vous construisez.',
  'You met the family offices’ LPs: they’ll remember your fund.':
    'Vous avez rencontré les LP des family offices : ils se souviendront de votre fonds.',
  'The doctor saw you: rest, and you’ll be fine.':
    'Le médecin vous a examiné : reposez-vous et tout ira bien.',
  '{n} graduates applied for your open role.':
    '{n} jeunes diplômés ont postulé à votre poste ouvert.',
  'A guest lecture by a founder who built something big.':
    'Une conférence d’un fondateur qui a bâti quelque chose de grand.',
  'The proposal:': 'La proposition :',
  'Vote for': 'Voter pour',
  'Vote against': 'Voter contre',
  'Live price board': 'Tableau des cours en direct',
  'Traders on the floor watch these all day.':
    'Les traders du parquet les surveillent toute la journée.',
  'The board lights up when the market opens.': 'Le tableau s’allume à l’ouverture du marché.',
  Index: 'Indice',
  'No companies listed yet.': 'Aucune entreprise cotée pour l’instant.',
  'Trade on the Markets screen': 'Passer des ordres dans l’écran Marchés',
  'Food for the week: +{n} hunger.': 'Des courses pour la semaine : +{n} faim.',
  'New {item}: in your wardrobe, and on you.':
    'Nouveau : {item}, dans votre garde-robe et sur vous.',
  'You took your medicine and feel better.': 'Vous avez pris vos médicaments et vous allez mieux.',
  'Your car is serviced and running well.': 'Votre voiture est révisée et roule bien.',
  'A prototype built in the workshop: +{h}h on your build this month.':
    'Un prototype fabriqué à l’atelier : +{h} h sur votre développement ce mois-ci.',
  'A course: your {skill} is a little stronger.':
    'Une formation : votre compétence {skill} progresse un peu.',
  'Stock stored safely: fewer failed orders.': 'Stock bien entreposé : moins de commandes ratées.',
  'Stock shipped on time: your customers notice.':
    'Stock expédié à temps : vos clients le remarquent.',
  'Your lawyer filed it: {rule}.': 'Votre avocat s’en est chargé : {rule}.',
  'You met the team at {org}.': 'Vous avez rencontré l’équipe de {org}.',
  'You met the team.': 'Vous avez rencontré l’équipe.',
  'You talked to the customers waiting: {segment} care about {needs}.':
    'Vous avez parlé aux clients qui attendaient : pour {segment}, ce qui compte, c’est {needs}.',
  'A friendly chat while you waited.': 'Une conversation sympathique en attendant.',
  'A test drive: fun, and no pressure to buy.':
    'Un essai sur route : amusant, et sans obligation d’achat.',
  'A tip in the paper: {name} is looking for a supplier. They’re in your pipeline.':
    'Un tuyau dans le journal : {name} cherche un fournisseur. Ils sont dans votre pipeline.',
  'The paper led you to {n} founders raising: they’re in your pipeline.':
    'Le journal vous a mené à {n} fondateurs en levée : ils sont dans votre pipeline.',
  'You read the papers.': 'Vous avez lu les journaux.',
  'In the lounge you met {names}: they’ll remember you when you pitch.':
    'Au salon, vous avez rencontré {names} : ils se souviendront de vous quand vous pitcherez.',
  'In the lounge {n} founders pitched you: they’re in your pipeline.':
    'Au salon, {n} fondateurs vous ont pitché : ils sont dans votre pipeline.',
  'A quiet hour in the lounge.': 'Une heure tranquille au salon.',
  'Stand-up done: today the team chases a new lead, {name}.':
    'Point du matin fait : aujourd’hui l’équipe relance un nouveau prospect, {name}.',
  'Stand-up done: today is for selling.': 'Point du matin fait : aujourd’hui, on vend.',
  'Stand-up done: a calmer team today.':
    'Point du matin fait : une équipe plus sereine aujourd’hui.',
  'Stand-up done: today the team builds (+{h}h).':
    'Point du matin fait : aujourd’hui l’équipe développe (+{h} h).',
  'Office hours with the programme lead: you leave with sharper ideas.':
    'Permanence avec le responsable du programme : vous repartez avec des idées plus claires.',
  'You met {names} from the cohort.': 'Vous avez rencontré {names}, de la promotion.',
  'The cohort is heads-down today.': 'La promotion a le nez dans le guidon aujourd’hui.',
  'You rehearsed your demo-day pitch.': 'Vous avez répété votre pitch du demo day.',
  Build: 'Développer',
  'Everyone on the product today': 'Tout le monde sur le produit aujourd’hui',
  'Chase a new customer lead': 'Relancer un nouveau prospect',
  'The team': 'L’équipe',
  'Clear blockers, ease the pressure': 'Lever les blocages, faire baisser la pression',
  '{item} (you have it)': '{item} (vous l’avez)',
  'Pick what the team does today.': 'Choisissez ce que fait l’équipe aujourd’hui.',
  Salesperson: 'Vendeur',
  'Newsstand vendor': 'Marchand de journaux',
  'Tutor for pay': 'Donner des cours (rémunéré)',
  'To a friend, from your wallet': 'À un ami, depuis votre portefeuille',
  'Cash out your dollars': 'Retirer vos dollars',
  'Cashed out: your dollars are in your wallet.':
    'Retrait effectué : vos dollars sont dans votre portefeuille.',
  'Sign up this agent': 'Recruter cet agent',
  'Sign a delivery deal': 'Signer un contrat de livraison',
  'Open an account here': 'Ouvrir un compte ici',
  'Move your personal account to this bank': 'Transférer votre compte personnel dans cette banque',
  'Your account is with this bank now.': 'Votre compte est désormais dans cette banque.',
  'Bank {company} here': 'Domicilier {company} ici',
  '{company} banks here now.': '{company} est désormais cliente ici.',
  'Today’s prices on the floor': 'Les cours du jour sur le parquet',
  'Doctor jobs': 'Postes de médecin',
  'Interview room': 'Salle d’entretien',
  'Candidates for your open roles': 'Les candidats à vos postes ouverts',

  // ---- Errands (engine labels and refusals)
  'Buy food for the week': 'Faire les courses de la semaine',
  'Buy clothes': 'Acheter des vêtements',
  'Buy medicine': 'Acheter des médicaments',
  'Service your car': 'Faire réviser votre voiture',
  'Build a prototype in the workshop': 'Fabriquer un prototype à l’atelier',
  'Take a course': 'Suivre une formation',
  'Rent storage space': 'Louer un espace de stockage',
  'Ship stock to customers': 'Expédier du stock aux clients',
  'Book a lawyer for company papers': 'Prendre un avocat pour les papiers de l’entreprise',
  'Meet the team': 'Rencontrer l’équipe',
  'Chat to the customers waiting': 'Discuter avec les clients qui attendent',
  'Take a test drive': 'Faire un essai sur route',
  'Buy a paper': 'Acheter un journal',
  'Business lounge: meet travelling investors':
    'Salon affaires : rencontrer des investisseurs de passage',
  'Morning stand-up': 'Point du matin',
  'Office hours with the programme lead': 'Permanence avec le responsable du programme',
  'Meet the cohort at their desks': 'Rencontrer la promotion à leurs bureaux',
  'Demo-day rehearsal': 'Répétition du demo day',
  'Done today. Come back tomorrow.': 'Fait aujourd’hui. Revenez demain.',
  'You’re not hungry.': 'Vous n’avez pas faim.',
  'They don’t sell that here.': 'On ne vend pas ça ici.',
  'You already have that.': 'Vous l’avez déjà.',
  'You’re well: nothing you need today.':
    'Vous allez bien : rien dont vous ayez besoin aujourd’hui.',
  'You don’t have a car.': 'Vous n’avez pas de voiture.',
  'For companies that ship goods.': 'Pour les entreprises qui expédient des marchandises.',
  'Your company’s papers are in order.': 'Les papiers de votre entreprise sont en ordre.',
  'Your office is in your home city.': 'Votre bureau est dans votre ville.',
  'Pick a focus for the day.': 'Choisissez la priorité du jour.',
  'For founders with a company.': 'Pour les fondateurs qui ont une entreprise.',
  'Your company can’t pay for that.': 'Votre entreprise ne peut pas payer ça.',
  'They don’t do that here.': 'On ne fait pas ça ici.',
  'Nothing to do there.': 'Rien à faire là-bas.',
  'That place is in another city.': 'Cet endroit est dans une autre ville.',
  'Pick something to buy.': 'Choisissez quelque chose à acheter.',

  // ---- Civic places: the feedback round's services
  'Public consultation: vote on a tax change':
    'Consultation publique : voter sur une réforme fiscale',
  'Policy-rate briefing': 'Point sur le taux directeur',
  'Members’ directory: SME sales leads': 'Annuaire des membres : prospects PME',
  'Watch a case': 'Assister à une audience',
  'Monthly filing check': 'Vérification mensuelle des déclarations',
  'Tax clinic: ask a question': 'Permanence fiscale : poser une question',
  'Trade attaché: export leads': 'Attaché commercial : prospects à l’export',
  'Meet a visiting investor delegation': 'Rencontrer une délégation d’investisseurs en visite',
  'Peer feedback from other founders': 'Retours d’autres fondateurs',
  'Meet the members': 'Rencontrer les membres',
  'LP meetings': 'Rendez-vous avec des LP',
  'See a doctor': 'Voir un médecin',
  'Careers fair: meet graduates': 'Salon de l’emploi : rencontrer des jeunes diplômés',
  'Guest lecture': 'Conférence invitée',
  'Open a role on the Hiring screen first.': 'Ouvrez d’abord un poste dans l’écran Recrutement.',
  'You’re well. Come in when you’re unwell.':
    'Vous allez bien. Revenez quand vous serez souffrant.',

  // ---- What's in the paper
  'The business pages say the central bank may cut rates next quarter: borrowers are watching.':
    'Les pages économie disent que la banque centrale pourrait baisser ses taux le trimestre prochain : les emprunteurs sont aux aguets.',
  'A columnist says the city’s market traders are moving to mobile money faster than the banks expected.':
    'Un chroniqueur écrit que les commerçants des marchés de la ville passent au mobile money plus vite que les banques ne l’imaginaient.',
  'Word in the property section: offices near the new rail line are filling up.':
    'Dans les pages immobilier : les bureaux près de la nouvelle ligne de train se remplissent.',
  'The small ads are full of shops looking for someone to fix their websites.':
    'Les petites annonces regorgent de boutiques qui cherchent quelqu’un pour réparer leur site web.',
  'A profile of a founder who sold her company says she asked every customer the same three questions.':
    'Le portrait d’une fondatrice qui a vendu son entreprise raconte qu’elle posait les trois mêmes questions à chaque client.',
  'The paper says two big funds are raising new money to invest in the region this year.':
    'Le journal annonce que deux grands fonds lèvent de nouveaux capitaux pour investir dans la région cette année.',

  // ---- Cases at the High Court
  'A software supplier against a retailer over unpaid invoices':
    'Un éditeur de logiciels contre un distributeur pour des factures impayées',
  'The supplier lost: the retailer had asked for the extra work by phone and never signed a change order, so the court held the price was the one in the contract.':
    'Le fournisseur a perdu : le distributeur avait demandé le travail supplémentaire par téléphone sans jamais signer d’avenant, donc le tribunal a retenu le prix du contrat.',
  'Put every change to the scope in writing, with its price, before you do the work.':
    'Mettez chaque changement de périmètre par écrit, avec son prix, avant de faire le travail.',
  'A co-founder who left after four months claimed a third of the company':
    'Un cofondateur parti au bout de quatre mois réclamait un tiers de l’entreprise',
  'The company won: the founders’ agreement had a one-year cliff, so the departing founder kept no shares.':
    'L’entreprise a gagné : le pacte d’associés prévoyait une période d’acquisition minimale d’un an, le fondateur sortant n’a donc gardé aucune part.',
  'Founders’ shares should vest, with a cliff, from the first day.':
    'Les parts des fondateurs doivent s’acquérir progressivement, avec un seuil, dès le premier jour.',
  'A restaurant chain against a farm co-operative over late deliveries':
    'Une chaîne de restaurants contre une coopérative agricole pour des livraisons en retard',
  'The co-operative won: the contract promised “best efforts”, not a date, and the floods were outside its control.':
    'La coopérative a gagné : le contrat promettait « tous les efforts raisonnables », pas une date, et les inondations ne dépendaient pas d’elle.',
  'If a date matters to you, write the date and what happens if it’s missed.':
    'Si une date compte pour vous, écrivez-la, ainsi que ce qui se passe si elle n’est pas tenue.',
  'A logistics firm tried to stop a former manager working for a rival':
    'Une société de logistique voulait empêcher une ancienne responsable de travailler pour un concurrent',
  'The manager won: a five-year ban on working anywhere in the country was wider than the court would enforce.':
    'La responsable a gagné : une interdiction de cinq ans de travailler partout dans le pays allait au-delà de ce que le tribunal pouvait faire appliquer.',
  'A restraint has to be reasonable in time and place, or it may not hold at all.':
    'Une clause de non-concurrence doit être raisonnable dans le temps et l’espace, sinon elle risque de tomber.',
  'A bank against a founder after her company failed to repay a loan':
    'Une banque contre une fondatrice après que son entreprise n’a pas remboursé un prêt',
  'The bank won: the founder had signed a personal guarantee, so her own savings answered for the company’s debt.':
    'La banque a gagné : la fondatrice avait signé une caution personnelle, son épargne a donc répondu de la dette de l’entreprise.',
  'Read what a guarantee puts at risk before you sign it: it reaches past the company.':
    'Lisez ce qu’une caution met en jeu avant de la signer : elle va au-delà de l’entreprise.',
  'A freelancer claimed the code he wrote for a startup':
    'Un freelance revendiquait le code qu’il avait écrit pour une startup',
  'The freelancer won: nothing in his contract assigned the work to the company, so he still owned it.':
    'Le freelance a gagné : rien dans son contrat ne cédait le travail à l’entreprise, il en restait donc propriétaire.',
  'Make sure every contractor’s agreement assigns what they make to the company.':
    'Assurez-vous que le contrat de chaque prestataire cède à l’entreprise ce qu’il produit.',

  // ---- The tax clinic
  'Do I pay company tax before we make a profit?':
    'Dois-je payer l’impôt sur les sociétés avant de faire des bénéfices ?',
  'Company tax is on profit, so a company that loses money pays none that year, but it still files a return.':
    'L’impôt sur les sociétés porte sur les bénéfices : une entreprise en perte n’en paie pas cette année-là, mais elle dépose quand même sa déclaration.',
  'Can I pay myself from the company account whenever I like?':
    'Puis-je me payer depuis le compte de l’entreprise quand je veux ?',
  'Take a salary through payroll or a dividend from profit: money taken any other way is a loan from the company and may be taxed.':
    'Prenez un salaire via la paie ou un dividende sur les bénéfices : l’argent pris autrement est un prêt de l’entreprise et peut être imposé.',
  'Is the cost of my laptop deductible?': 'Le coût de mon ordinateur portable est-il déductible ?',
  'Equipment bought for the business is a cost of the business: keep the receipt and put it in the company’s books.':
    'Le matériel acheté pour l’activité est une charge de l’entreprise : gardez le reçu et passez-le dans la comptabilité.',
  'What happens if I file late?': 'Que se passe-t-il si je déclare en retard ?',
  'A late return brings a penalty and interest on what’s owed, even when the tax itself is small: file on time, even if you can’t pay yet.':
    'Une déclaration tardive entraîne une pénalité et des intérêts sur la somme due, même quand l’impôt est faible : déclarez à temps, même si vous ne pouvez pas encore payer.',
  'Do I charge sales tax to customers in another country?':
    'Dois-je facturer la TVA à des clients dans un autre pays ?',
  'Exports are usually zero-rated, but you still keep the invoices to show the goods or services left the country.':
    'Les exportations sont en général exonérées, mais gardez les factures pour prouver que les biens ou services ont quitté le pays.',
  'Should a new hire be a contractor or an employee?':
    'Une nouvelle recrue doit-elle être prestataire ou salariée ?',
  'If you set their hours and they work only for you, they are an employee in the tax office’s eyes, whatever the contract says.':
    'Si vous fixez ses horaires et qu’elle ne travaille que pour vous, c’est une salariée aux yeux du fisc, quoi que dise le contrat.',

  // ---- Public consultations
  'Cut company tax for small businesses (turnover under a set threshold) by two points.':
    'Baisser de deux points l’impôt sur les sociétés des petites entreprises (chiffre d’affaires sous un seuil fixé).',
  'A new tax of one percent on digital services sold in the country.':
    'Une nouvelle taxe d’un pour cent sur les services numériques vendus dans le pays.',
  'Tax relief for people who invest in young companies, up to a yearly cap.':
    'Un allègement fiscal pour ceux qui investissent dans de jeunes entreprises, dans la limite d’un plafond annuel.',
  'A small levy on every mobile money transfer, to fund roads.':
    'Un petit prélèvement sur chaque transfert de mobile money, pour financer les routes.',
};
