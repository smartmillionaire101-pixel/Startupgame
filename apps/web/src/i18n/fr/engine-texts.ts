/**
 * French: the engine's own texts, as templates (round 7). Inbox
 * notifications, refusals, a pitch's reason: the engine writes them in
 * English with names and amounts filled in, and tx() reads them back through
 * these entries ('Loan from {lender} repaid in full.' fits any lender; what
 * fills a placeholder is translated too when the catalog has it). A test
 * (engine-texts.test.ts) checks every engine notification has an entry here.
 */
export const engineTexts: Record<string, string> = {
  // ---- Small words the templates fill in
  'An LP': 'Un LP',
  'An investor': 'Un investisseur',
  'A company': 'Une entreprise',
  'Your lender': 'Votre prêteur',
  'the winner': 'le gagnant',
  'the shares': 'les actions',
  'the venue': 'le lieu',
  'their room': 'leur chambre',
  'room {n}': 'la chambre {n}',
  '(room {n})': '(chambre {n})',
  'the employer': 'l’employeur',
  'the company': 'l’entreprise',
  'A customer interview': 'Un entretien client',
  Resting: 'Se reposer',
  tonight: 'ce soir',
  bought: 'acheté',
  sold: 'vendu',
  'outages and slow support': 'des pannes et un support lent',
  'They’ll pay your flight and hotel.': 'Ils paient votre vol et votre hôtel.',
  'Everyone pays their own way.': 'Chacun paie sa part.',
  'Your stake is back.': 'Votre mise vous est rendue.',
  'It’s off.': 'C’est annulé.',
  'Your ticket was refunded.': 'Votre billet a été remboursé.',
  'Your job has ended.': 'Votre emploi a pris fin.',
  // ---- Hours (helpers.ts)
  '{what} needs {h}h; you have {left}h left this month.':
    '{what} demande {h} h ; il vous reste {left} h ce mois-ci.',
  // ---- Companies, acquisitions, AI founders
  '{buyer} bought {company}.': '{buyer} a racheté {company}.',
  'While you were away, {companies} went into hibernation to save cash: staff on furlough pay, product work paused. Wake {them} up from the dashboard when you’re ready.':
    'Pendant votre absence, {companies} sont passées en hibernation pour économiser : équipe au chômage partiel, produit en pause. Réveillez-les ({them}) depuis le tableau de bord quand vous êtes prêt.',
  'You’ve been away {n} months. Your company is in maintenance mode.':
    'Vous êtes absent depuis {n} mois. Votre entreprise est en mode maintenance.',
  '{company} is now offered for sale. Investors and co-founders get first vote.':
    '{company} est maintenant à vendre. Les investisseurs et les cofondateurs votent en premier.',
  'Your personal guarantee was called: {amount} taken from savings.':
    'Votre caution personnelle a été appelée : {amount} prélevés sur votre épargne.',
  'Regulator fine: {amount} ({why}).': 'Amende du régulateur : {amount} ({why}).',
  '{company} wound down properly. Staff were paid. Your reputation holds.':
    '{company} a fermé proprement. L’équipe a été payée. Votre réputation tient.',
  '{company} collapsed with staff unpaid. This will follow you.':
    '{company} s’est effondrée sans payer son équipe. Cela vous suivra.',
  '{name} is now {title} of {company}.': '{name} est maintenant {title} de {company}.',
  '{name}, whom you’ve worked with before, just started {company}.':
    '{name}, avec qui vous avez déjà travaillé, vient de lancer {company}.',
  '{name}, a founder you know, just started {company}.':
    '{name}, un fondateur que vous connaissez, vient de lancer {company}.',
  '{company} is out of distress. Keep an eye on the burn.':
    '{company} est sortie de la zone rouge. Surveillez vos dépenses.',
  '{investor} passed on the bridge: “{why}”': '{investor} a refusé le prêt relais : « {why} »',
  'Milestone: {label}': 'Étape franchie : {label}',
  'Arbitrator: {ruling}': 'Arbitre : {ruling}',
  // ---- LP funds and allocation
  '{fof} (a fund of funds) committed {amount} to {fund}.':
    '{fof} (un fonds de fonds) s’est engagé à hauteur de {amount} dans {fund}.',
  "{fund}'s advisory committee: {name} asks to invest in {company}. {why} Vote in your LP portfolio by month end.":
    'Comité consultatif de {fund} : {name} demande à investir dans {company}. {why} Votez dans votre portefeuille LP avant la fin du mois.',
  "{fund}'s advisory committee {outcome} the deal in {company}.":
    'Comité consultatif de {fund} : opération dans {company} {outcome}e.',
  '{name} wants to sell their LP stake in {fund} to a secondary buyer for {price}. Approve or reject it in your fund.':
    '{name} veut vendre sa part de LP dans {fund} à un acheteur secondaire pour {price}. Approuvez ou refusez dans votre fonds.',
  '{name} offers you their LP stake in {fund} for {price}. Answer in your LP portfolio.':
    '{name} vous propose sa part de LP dans {fund} pour {price}. Répondez dans votre portefeuille LP.',
  '{name} declined your LP stake.': '{name} a refusé votre part de LP.',
  '{seller} wants to sell their LP stake in {fund} to {buyer} for {price}. Approve or reject it in your fund.':
    '{seller} veut vendre sa part de LP dans {fund} à {buyer} pour {price}. Approuvez ou refusez dans votre fonds.',
  '{buyer} bought your LP stake in {fund} for {price}.':
    '{buyer} a racheté votre part de LP dans {fund} pour {price}.',
  "You’re an LP in {fund} now: {seller}'s stake is yours.":
    'Vous êtes maintenant LP dans {fund} : la part de {seller} est à vous.',
  'You sold {pct}% of your {company} stake to {buyer} for {price}. It cost you {basis}; tax {tax}. {net} is in your personal account.':
    'Vous avez vendu {pct} % de votre participation dans {company} à {buyer} pour {price}. Elle vous avait coûté {basis} ; impôt {tax}. {net} sont sur votre compte personnel.',
  '{fund} is raising {amount} (target {target}). LPs can commit from {min}.':
    '{fund} lève {amount} (objectif {target}). Les LP peuvent s’engager à partir de {min}.',
  '{fund} didn’t close. Your commitment is released.':
    '{fund} n’a pas bouclé sa levée. Votre engagement est libéré.',
  '{name} committed {amount} to {fund}.': '{name} s’est engagé à hauteur de {amount} dans {fund}.',
  '{fund} held its first close. First capital call: see your LP portfolio.':
    '{fund} a tenu son premier closing. Premier appel de fonds : voyez votre portefeuille LP.',
  '{fund} held its final close: {amount} from {n} LPs.':
    '{fund} a tenu son closing final : {amount} de {n} LP.',
  'Capital call from {fund}: {amount} due by month {month}.':
    'Appel de fonds de {fund} : {amount} à payer avant le mois {month}.',
  'Your GP commitment to {fund}: {amount} due by month {month}.':
    'Votre engagement de GP dans {fund} : {amount} à payer avant le mois {month}.',
  '{name} asked for a month more on a capital call to {fund}.':
    '{name} a demandé un mois de plus pour un appel de fonds de {fund}.',
  'You missed a capital call to {fund}. You forfeit {amount} of what you paid in, it goes on your credit record, and you can’t commit to funds for {n} months.':
    'Vous avez manqué un appel de fonds de {fund}. Vous perdez {amount} de ce que vous avez versé, c’est inscrit à votre dossier de crédit, et vous ne pouvez plus vous engager dans des fonds pendant {n} mois.',
  '{name} defaulted on a capital call to {fund}.':
    '{name} a fait défaut sur un appel de fonds de {fund}.',
  '{fund} distributed {amount} to you (tax {tax}).':
    '{fund} vous a distribué {amount} (impôt {tax}).',
  'Carry paid from {fund}: {amount}. Tax: {tax}.':
    'Carried interest versé par {fund} : {amount}. Impôt : {tax}.',
  'Carry paid: {amount}. Tax: {tax}.': 'Carried interest versé : {amount}. Impôt : {tax}.',
  'AI LPs committed {amount} to {fund}.':
    'Des LP IA se sont engagés à hauteur de {amount} dans {fund}.',
  'AI LP panel: {amount} committed of the {need} a first close needs. Read their questions and reasons, then pitch again.':
    'Panel de LP IA : {amount} engagés sur les {need} qu’exige un premier closing. Lisez leurs questions et leurs raisons, puis présentez-vous à nouveau.',
  '{n} LPs committed {amount} to {fund}.':
    '{n} LP se sont engagés à hauteur de {amount} dans {fund}.',
  'LP panel: {amount} committed of the {need} a first close needs. Read their answers and your next steps, then pitch again.':
    'Panel de LP : {amount} engagés sur les {need} qu’exige un premier closing. Lisez leurs réponses et vos prochaines étapes, puis présentez-vous à nouveau.',
  ', anchored by {name}': ', avec {name} comme investisseur principal',
  '{n} LPs committed {amount} to {fund}{anchor}. First close held: it can invest now, and LPs can still join until the final close.':
    '{n} LP se sont engagés à hauteur de {amount} dans {fund}{anchor}. Premier closing tenu : le fonds peut investir, et des LP peuvent encore le rejoindre jusqu’au closing final.',
  '{name} joined {fund} after its first close: {amount} (with a catch-up).':
    '{name} a rejoint {fund} après son premier closing : {amount} (avec rattrapage).',
  '{fund} is past its investment period: follow-ons only, and the fee steps down.':
    '{fund} a dépassé sa période d’investissement : réinvestissements seulement, et les frais baissent.',
  'LPs in {fund} didn’t get last quarter’s letter. Trust fell.':
    'Les LP de {fund} n’ont pas reçu la lettre du dernier trimestre. La confiance a baissé.',
  'Quarterly LP letter due for {fund}.': 'Lettre trimestrielle aux LP à envoyer pour {fund}.',
  'LPs in {fund} noticed the marks in your last letter were too high. Trust fell sharply.':
    'Les LP de {fund} ont remarqué que les valorisations de votre dernière lettre étaient trop hautes. La confiance a chuté.',
  'LPs voted to extend {fund} by {n} months.':
    'Les LP ont voté la prolongation de {fund} de {n} mois.',
  '{fund} reached the end of its term and is wound down: {amount} distributed.':
    '{fund} est arrivé à son terme et a été liquidé : {amount} distribués.',
  '{company} raised again. Your pro-rata: {amount} at the same terms, until month {month}.':
    '{company} a de nouveau levé des fonds. Votre prorata : {amount} aux mêmes conditions, jusqu’au mois {month}.',
  // ---- Mentoring, giving, careers
  '{company} took you on as a mentor: {pct}% advisor shares ({shares} shares). Your advice starts next month.':
    '{company} vous a pris comme mentor : {pct} % d’actions de conseiller ({shares} actions). Vos conseils commencent le mois prochain.',
  '{name} offers to mentor {company}: monthly advice for {pct}% advisor shares. Answer in Capital.':
    '{name} propose d’accompagner {company} : des conseils chaque mois contre {pct} % d’actions de conseiller. Répondez dans Capital.',
  '{company} said no to your mentoring offer, for now.':
    '{company} a refusé votre offre de mentorat, pour l’instant.',
  'A year of mentoring {company} is done. Your advisor shares stay yours.':
    'Votre année de mentorat avec {company} est terminée. Vos actions de conseiller restent à vous.',
  'You gave {amount} to {cause}: about {n} {unit}.':
    'Vous avez donné {amount} à {cause} : environ {n} {unit}.',
  'You joined {org} as {title}: {salary} a month before tax, {h}h of your month.':
    'Vous avez rejoint {org} comme {title} : {salary} par mois avant impôt, {h} h de votre mois.',
  'Career: you’re now a {title}. {unlocks}': 'Carrière : vous êtes maintenant {title}. {unlocks}',
  'Career: you’re now an {title}. {unlocks}': 'Carrière : vous êtes maintenant {title}. {unlocks}',
  '{name} would like to co-lead your first syndicate: they’ll match your cheque. Answer in your career ladder.':
    '{name} aimerait co-mener votre premier syndicat : il égalera votre chèque. Répondez dans votre parcours de carrière.',
  '{name} offers to anchor your Fund I with {amount}. Answer in your career ladder.':
    '{name} propose d’être l’investisseur principal de votre Fonds I avec {amount}. Répondez dans votre parcours de carrière.',
  '{name} invites you to join {firm} as a partner with {pct}% of the carry pool. Answer in your Portfolio.':
    '{name} vous invite à rejoindre {firm} comme associé avec {pct} % du carried interest. Répondez dans votre Portefeuille.',
  '{name} joined {firm} as a partner.': '{name} a rejoint {firm} comme associé.',
  '{name} declined to join {firm}.': '{name} a refusé de rejoindre {firm}.',
  '{name} wants {pct}% of the carry pool, or will leave. Answer in your firm.':
    '{name} veut {pct} % du carried interest, sinon il part. Répondez dans votre société.',
  '{name} handed {firm} to you. You run its funds now.':
    '{name} vous a confié {firm}. Vous gérez ses fonds désormais.',
  // ---- Banks and bankers
  '{name}: three investor groups have sent term offers. Compare them, negotiate, then sign and file for your licence.':
    '{name} : trois groupes d’investisseurs ont envoyé des offres. Comparez-les, négociez, puis signez et déposez votre demande de licence.',
  '{name} invites you to co-found {bank} with {amount} of capital. Answer from the Bank screen.':
    '{name} vous invite à cofonder {bank} avec {amount} de capital. Répondez depuis l’écran Banque.',
  '{name} is co-founding {bank} with {amount}.': '{name} cofonde {bank} avec {amount}.',
  '{name} declined to co-found {bank}.': '{name} a refusé de cofonder {bank}.',
  'Signed: {bank} has {amount} of capital and you own {pct}%. Licence application filed: book your fit-and-proper interview at the Central Bank.':
    'Signé : {bank} dispose de {amount} de capital et vous en détenez {pct} %. Demande de licence déposée : réservez votre entretien d’aptitude à la Banque centrale.',
  'Fit-and-proper interview passed ({score}/100).': 'Entretien d’aptitude réussi ({score}/100).',
  'The regulator wasn’t convinced ({score}/100; they need {need}). Weakest answer: “{answer}” Book another appointment to try again.':
    'Le régulateur n’a pas été convaincu ({score}/100 ; il faut {need}). Réponse la plus faible : « {answer} » Prenez un autre rendez-vous pour réessayer.',
  'Approval in principle for {bank}. Sign up your first clients before you open, and finish the checklist for the final licence.':
    'Accord de principe pour {bank}. Inscrivez vos premiers clients avant l’ouverture, et terminez la liste de contrôle pour la licence définitive.',
  "The regulator lifted the conditions on {bank}'s licence.":
    'Le régulateur a levé les conditions de la licence de {bank}.',
  'Licence refused for {bank} (score {score}). {why} Fix it and the regulator reviews it again.':
    'Licence refusée pour {bank} (score {score}). {why} Corrigez-le et le régulateur la réexaminera.',
  'with {n} clients': 'avec {n} clients',
  'Licence granted: {bank} is open for business{clients}.':
    'Licence accordée : {bank} est ouverte{clients}.',
  'Licence granted with conditions: {bank} is open, with a lending cap for {n} months. {why}':
    'Licence accordée sous conditions : {bank} est ouverte, avec un plafond de prêts pendant {n} mois. {why}',
  'Performance shares vested ({shares}) at {bank}.':
    'Actions de performance acquises ({shares}) chez {bank}.',
  'AI shareholders put in {amount} ({x}× your stake). Licence application filed; the regulator decides in {n} months.':
    'Des actionnaires IA ont apporté {amount} ({x}× votre mise). Demande de licence déposée ; le régulateur décide dans {n} mois.',
  '{bank} failed. You lost {amount} above the insured limit.':
    '{bank} a fait faillite. Vous avez perdu {amount} au-delà du plafond garanti.',
  'The central bank wound down {bank}. {why}': 'La banque centrale a liquidé {bank}. {why}',
  'Licence granted: {bank} is open for business.': 'Licence accordée : {bank} est ouverte.',
  'Licence refused: {bank} needs at least {amount} of capital and a cleaner credit profile.':
    'Licence refusée : {bank} a besoin d’au moins {amount} de capital et d’un meilleur profil de crédit.',
  '{bank} borrowed {amount} from the central bank above base rate.':
    '{bank} a emprunté {amount} à la banque centrale au-dessus du taux directeur.',
  '{name} took your request: {what} for {client}.':
    '{name} a pris votre demande : {what} pour {client}.',
  '{name} closed your {what} mandate for {client}. Fee: {fee}.':
    '{name} a conclu votre mandat « {what} » pour {client}. Commission : {fee}.',
  '{name}’s {what} for {client} didn’t come together. No fee.':
    '« {what} » de {name} pour {client} n’a pas abouti. Pas de commission.',
  'to {bank}': 'à {bank}',
  'Deal closed: {what} for {client}. Fee {fee}{to}.':
    'Opération conclue : {what} pour {client}. Commission {fee}{to}.',
  '{client} walked away: the {what} didn’t come together.':
    '{client} s’est retiré : « {what} » n’a pas abouti.',
  '{client} heard about your work for {other}: {what}. It’s on your advisory desk.':
    '{client} a entendu parler de votre travail pour {other} : {what}. C’est sur votre bureau de conseil.',
  '{client} is looking for an adviser: {what}. It’s on your advisory desk.':
    '{client} cherche un conseiller : {what}. C’est sur votre bureau de conseil.',
  '{n} client{s} you met joined {bank}.':
    '{n} client{s} que vous avez rencontrés ont rejoint {bank}.',
  '{bank}’s {city} branch in {district} closed: {why}.':
    'L’agence de {bank} à {city} ({district}) a fermé : {why}.',
  'You’re the new governor of the central bank in {city}: {bank} is the best-run bank in the city.':
    'Vous êtes le nouveau gouverneur de la banque centrale de {city} : {bank} est la banque la mieux gérée de la ville.',
  '{name} replaces you as central bank governor in {city}.':
    '{name} vous remplace comme gouverneur de la banque centrale de {city}.',
  // ---- Loans, property, living
  'Loan received: {amount}.': 'Prêt reçu : {amount}.',
  'Loan received: {amount}': 'Prêt reçu : {amount}',
  'Loan from {lender} repaid in full.': 'Prêt de {lender} entièrement remboursé.',
  'Missed a loan payment to {lender}. Two in a row is a default.':
    'Échéance de prêt manquée auprès de {lender}. Deux de suite, c’est un défaut.',
  'You defaulted on your loan from {lender}.{seized}':
    'Vous avez fait défaut sur votre prêt de {lender}.{seized}',
  '{lender}: {n} paying customers, condition met. The second {amount} is ready on the offer card.':
    '{lender} : {n} clients payants, condition remplie. Les {amount} suivants sont prêts sur la fiche d’offre.',
  '{lender} repossessed your {home} after {n} missed payments.':
    '{lender} a saisi votre {home} après {n} échéances manquées.',
  'You couldn’t cover the running costs of your {home} ({amount}). The service company will chase you.':
    'Vous n’avez pas pu payer les charges de votre {home} ({amount}). Le syndic va vous relancer.',
  'Mortgage paid off: your {home} is all yours.':
    'Crédit immobilier remboursé : votre {home} est entièrement à vous.',
  'You missed a mortgage payment on your {home} ({amount}). {n} more and {lender} repossesses it.':
    'Vous avez manqué une échéance de crédit sur votre {home} ({amount}). Encore {n} et {lender} le saisit.',
  'You couldn’t cover living costs. Downgraded to {tier}.':
    'Vous n’avez pas pu couvrir vos frais de vie. Passage à {tier}.',
  'You couldn’t cover your car’s running costs ({amount}). Sell it if money is tight.':
    'Vous n’avez pas pu payer les frais de votre voiture ({amount}). Vendez-la si l’argent manque.',
  // ---- Competitions, programs, institutions
  '{name} wants to talk: a warm intro is waiting.':
    '{name} veut discuter : une introduction vous attend.',
  '{company} won {competition} ({score}/10) and {prize}.{more}':
    '{company} a remporté {competition} ({score}/10) et {prize}.{more}',
  ', and wins {prize} as runner-up': ', et gagne {prize} en tant que deuxième',
  '{competition}: {company} came {rank} of {n} ({score}/10){prize}.':
    '{competition} : {company} est arrivée {rank} sur {n} ({score}/10){prize}.',
  '{competition} results are in: {company} won.':
    'Les résultats de {competition} sont tombés : {company} a gagné.',
  '{program} said no: “{why}”': '{program} a dit non : « {why} »',
  'Demo day at {program}: you pitched the room. Funds are paying attention for the next three months.':
    'Demo day chez {program} : vous avez présenté devant la salle. Les fonds vous suivent de près pendant les trois prochains mois.',
  '{program} awarded {company} a grant. {more}':
    '{program} a accordé une subvention à {company}. {more}',
  '{program}: report accepted. The second tranche ({amount}) is in.':
    '{program} : rapport accepté. La deuxième tranche ({amount}) est versée.',
  '{program}: the report missed the condition ({what}). The second tranche lapses.':
    '{program} : le rapport ne remplit pas la condition ({what}). La deuxième tranche est perdue.',
  "{program} held its demo day: {company} pitched the city's investors.":
    '{program} a tenu son demo day : {company} s’est présentée aux investisseurs de la ville.',
  // ---- Deals, dealcraft, deal flow, governance
  '{name} passed on {company}: “{why}. Keep us posted.”':
    '{name} a passé son tour sur {company} : « {why}. Tenez-nous au courant. »',
  '{company} chose another offer: {why}.': '{company} a choisi une autre offre : {why}.',
  '{company} chose your offer from several.': '{company} a choisi votre offre parmi plusieurs.',
  '{company} passed on your offer: {why}.': '{company} a refusé votre offre : {why}.',
  '{name} reviewed you: {stars}{empty}.': '{name} vous a noté : {stars}{empty}.',
  "You never answered {company}'s pitch. Founders talk: your founder trust fell.":
    'Vous n’avez jamais répondu au pitch de {company}. Les fondateurs en parlent : la confiance des fondateurs a baissé.',
  '{company}, on your watchlist, just raised a round.':
    '{company}, dans votre liste de suivi, vient de lever un tour.',
  '{company}, on your watchlist, is raising.':
    '{company}, dans votre liste de suivi, lève des fonds.',
  '{company} wants to pitch you (they heard good things).':
    '{company} veut vous présenter son projet (on lui a dit du bien de vous).',
  'You pitched {company} to {investor} at {firm}. You’re in their pipeline.':
    'Vous avez présenté {company} à {investor} chez {firm}. Vous êtes dans leur pipeline.',
  'New deal card: {what}': 'Nouvelle fiche d’accord : {what}',
  '{name} declined: {why}': '{name} a refusé : {why}',
  '{name} declined: “{why}”': '{name} a refusé : « {why} »',
  'Counter-offer: {what}': 'Contre-offre : {what}',
  'Their best offer: {what}': 'Leur meilleure offre : {what}',
  '{name} walked away: “We’re too far apart.”':
    '{name} s’est retiré : « Nous sommes trop éloignés. »',
  'You sold shares for {amount}. Tax: {tax}.':
    'Vous avez vendu des actions pour {amount}. Impôt : {tax}.',
  '{company} pitched you ({slides}).': '{company} vous a présenté son projet ({slides}).',
  "{company}'s round is hot: several investors are interested. They'll pick at month end on price, terms and reputation.":
    'Le tour de {company} est très demandé : plusieurs investisseurs sont intéressés. Ils choisiront en fin de mois selon le prix, les conditions et la réputation.',
  'Vote needed at {company}: {why}': 'Vote requis chez {company} : {why}',
  'Vote at {company} {outcome}: {why}': 'Vote chez {company} ({outcome}) : {why}',
  'The board of {company} removed you as CEO. You keep your shares. You can take it to the arbitrator.':
    'Le conseil de {company} vous a démis de vos fonctions de PDG. Vous gardez vos actions. Vous pouvez saisir l’arbitre.',
  // ---- Exits and the exchange
  'You sold {pct}% of your {company} shares to {buyer} for {price}. Tax: {tax}. {net} is in your personal account.':
    'Vous avez vendu {pct} % de vos actions {company} à {buyer} pour {price}. Impôt : {tax}. {net} sont sur votre compte personnel.',
  '{name} offers you {pct}% of their {company} shares for {price} (a {discount}% discount to the last round). Answer in Capital.':
    '{name} vous propose {pct} % de ses actions {company} pour {price} (une décote de {discount} % sur le dernier tour). Répondez dans Capital.',
  'The secondary offer for {company} was declined.':
    'L’offre secondaire pour {company} a été refusée.',
  'The bankers are preparing {company} for the stock market. You can list from month {month}.':
    'Les banquiers préparent l’entrée en bourse de {company}. Vous pouvez être coté à partir du mois {month}.',
  '{company} is public. Your shares are worth more and you can sell them on the market after the lock-up (month {month}). Until you sell, it isn’t cash.':
    '{company} est cotée. Vos actions valent plus et vous pourrez les vendre en bourse après la période de blocage (mois {month}). Tant que vous ne vendez pas, ce n’est pas de l’argent.',
  'Your {company} lock-up is over: you can sell shares on the market now.':
    'Votre période de blocage sur {company} est terminée : vous pouvez vendre vos actions en bourse.',
  'Order filled: {side} {n} {company} shares at {price}.':
    'Ordre exécuté : {n} actions {company} {side}s à {price}.',
  'Order for {company} cancelled: {why}': 'Ordre sur {company} annulé : {why}',
  'Dividend from {company}: {amount}.': 'Dividende de {company} : {amount}.',
  // ---- Customers, suppliers, sales
  'First customer: a buyer from {segment} signed up. Keep them happy.':
    'Premier client : un acheteur du segment « {segment} » s’est inscrit. Gardez-le satisfait.',
  '{customer} stopped buying from {company}: {why}.':
    '{customer} a cessé d’acheter à {company} : {why}.',
  '{customer} started buying from {company}.': '{customer} a commencé à acheter à {company}.',
  '{customer} stopped buying from {company}.': '{customer} a cessé d’acheter à {company}.',
  '{customer} went cold: the deal ran out of time.':
    '{customer} s’est refroidi : l’affaire a manqué de temps.',
  '{customer} asked you to come back about now: they’re ready to talk again.':
    '{customer} vous avait demandé de revenir vers maintenant : ils sont prêts à en reparler.',
  '{customer} paid their first month up front: {amount} is in {company}’s business account.':
    '{customer} a payé son premier mois d’avance : {amount} sont sur le compte professionnel de {company}.',
  'Flagged: {what}.': 'Signalé : {what}.',
  'Supply contract: {supplier} supplies {what} ({tier}) for {amount}/month.{flag}':
    'Contrat d’approvisionnement : {supplier} fournit {what} ({tier}) pour {amount}/mois.{flag}',
  '{company} cancelled its supply contract with you.':
    '{company} a résilié son contrat d’approvisionnement avec vous.',
  'Your supplier {supplier} failed. Service is disrupted while you switch to the default AI supplier.':
    'Votre fournisseur {supplier} a fait faillite. Le service est perturbé le temps de passer au fournisseur IA par défaut.',
  '{company} couldn’t pay. Contract cancelled.': '{company} n’a pas pu payer. Contrat résilié.',
  // ---- Fundraising and the pitch meeting
  '{partner} at {fund} would like to hear your pitch.':
    '{partner}, chez {fund}, aimerait entendre votre pitch.',
  'Welcome note from {reporter} ({outlet}): “Good luck with {company}. Tell us when you have news.”':
    'Mot de bienvenue de {reporter} ({outlet}) : « Bonne chance avec {company}. Prévenez-nous quand vous avez du nouveau. »',
  '{company} ({industry}) is raising and wants to pitch you.':
    '{company} ({industry}) lève des fonds et veut vous présenter son projet.',
  'Welcome note from {reporter} ({outlet}): “New money in town. We’ll be watching your first cheque.”':
    'Mot de bienvenue de {reporter} ({outlet}) : « Du nouvel argent en ville. Nous suivrons votre premier chèque. »',
  '{partner}: “We’d like to invest. Term sheet attached.”':
    '{partner} : « Nous aimerions investir. La term sheet est jointe. »',
  'Come back when one customer pays you.': 'Revenez quand un client vous paiera.',
  'You’re too close to running out of money for us.':
    'Vous êtes trop près de manquer d’argent pour nous.',
  'We’re too far apart on price.': 'Nous sommes trop éloignés sur le prix.',
  'The price is ahead of where you are.': 'Le prix est en avance sur où vous en êtes.',
  'The story isn’t there yet.': 'L’histoire n’y est pas encore.',
  'Not this time. Keep us posted.': 'Pas cette fois. Tenez-nous au courant.',
  '{partner}: “{line}”': '{partner} : « {line} »',
  '{company} pitched you ({slides}), with their answers. Answer it in Deal offers.':
    '{company} vous a présenté son projet ({slides}), avec ses réponses. Répondez dans les offres d’investissement.',
  '{partner}: “Your numbers didn’t match what we found in diligence.”':
    '{partner} : « Vos chiffres ne correspondaient pas à ce que nous avons trouvé lors des vérifications. »',
  '{partner}: “I’d like you to meet my partners.”':
    '{partner} : « J’aimerais que vous rencontriez mes associés. »',
  '{name}: “Thank you. We’re passing for now: {why}.”':
    '{name} : « Merci. Nous passons notre tour pour l’instant : {why}. »',
  '{name} accepted your ask for {company}. The term sheet is in your pitch.':
    '{name} a accepté votre demande pour {company}. La term sheet est dans votre pitch.',
  '{name} came back with a counter for {company}. The term sheet is in your pitch.':
    '{name} a répondu par une contre-proposition pour {company}. La term sheet est dans votre pitch.',
  'You left the meeting before the ask.': 'Vous avez quitté le rendez-vous avant la demande.',
  'Pitch not found.': 'Pitch introuvable.',
  'This meeting is over.': 'Ce rendez-vous est terminé.',
  'That isn’t one of the options.': 'Ce n’est pas l’une des options.',
  'Answer his questions first.': 'Répondez d’abord à ses questions.',
  'You’ve already answered this pitch.': 'Vous avez déjà répondu à ce pitch.',
  'Name an amount and a valuation.': 'Indiquez un montant et une valorisation.',
  'How many paying customers do you have today?':
    'Combien de clients payants avez-vous aujourd’hui ?',
  'How many months will your company’s money last?':
    'Combien de mois l’argent de votre entreprise va-t-il durer ?',
  'Not now: {why}': 'Pas maintenant : {why}',
  // ---- Sales pipeline and conversations
  'Your pipeline is full. Close or drop a deal first.':
    'Votre pipeline est plein. Concluez ou abandonnez d’abord une affaire.',
  'A discount can be at most {pct}%.': 'Une remise ne peut pas dépasser {pct} %.',
  'Call them first: then you can sit down and talk.':
    'Appelez-les d’abord : ensuite vous pourrez vous asseoir et discuter.',
  'That step isn’t possible at this stage of the deal.':
    'Cette étape n’est pas possible à ce stade de l’affaire.',
  'Sales conversation: {customer}': 'Conversation commerciale : {customer}',
  'Asking {customer} for the deal': 'Demander l’affaire à {customer}',
  '{customer} has closed.': '{customer} a fermé.',
  'This deal is closed.': 'Cette affaire est close.',
  'Pick someone from your sales team.': 'Choisissez quelqu’un de votre équipe commerciale.',
  'Your company doesn’t have the cash for this right now.':
    'Votre entreprise n’a pas la trésorerie pour ça en ce moment.',
  'You don’t have enough hours left this month for that.':
    'Il ne vous reste pas assez d’heures ce mois-ci pour ça.',
  'That price isn’t serious.': 'Ce prix n’est pas sérieux.',
  'A discount can be at most 40%.': 'Une remise ne peut pas dépasser 40 %.',
  'New lead: {customer}.': 'Nouveau prospect : {customer}.',
  '{n} new leads: {customers}.': '{n} nouveaux prospects : {customers}.',
  'Discovery meeting: {customer}': 'Rendez-vous de découverte : {customer}',
  // ---- Customer interviews
  'Finish your interview with {name} first.': 'Terminez d’abord votre entretien avec {name}.',
  'You’ve done {n} interviews this month. Come back next month.':
    'Vous avez fait {n} entretiens ce mois-ci. Revenez le mois prochain.',
  'Nobody to interview in that segment yet.':
    'Personne à interroger dans ce segment pour l’instant.',
  // ---- Resting at home
  'You’re not resting.': 'Vous ne vous reposez pas.',
  'Pick somewhere to rest.': 'Choisissez où vous reposer.',
  // ---- Staff and hiring
  '{name} took another job. Move faster next time.':
    '{name} a accepté un autre poste. Soyez plus rapide la prochaine fois.',
  '{name} ({role}) asks for a raise to the market rate.':
    '{name} ({role}) demande une augmentation au prix du marché.',
  'Key person {name} ({seniority} {role}) quit. Investors will notice.':
    'Personne clé, {name} ({role}, {seniority}) a démissionné. Les investisseurs le remarqueront.',
  '{name} ({role}) quit.': '{name} ({role}) a démissionné.',
  // ---- Work and jobs
  '{business} closed down: you’ve lost your job there.':
    '{business} a fermé : vous y avez perdu votre emploi.',
  '{owner} could only pay {paid} of your {promised} wage: business is slow.':
    '{owner} n’a pu payer que {paid} sur votre salaire de {promised} : les affaires sont calmes.',
  '{name} took you for {what} at {business}.': '{name} vous a emmené pour {what} chez {business}.',
  '{employer} turned you down for {job}: {why}':
    '{employer} a refusé votre candidature pour {job} : {why}',
  'Promoted at {employer}: you’re now {title}, {salary} a month before tax.':
    'Promotion chez {employer} : vous êtes maintenant {title}, {salary} par mois avant impôt.',
  '{employer} hired you as {title}: {salary} a month before tax, {h}h a month.':
    '{employer} vous a embauché comme {title} : {salary} par mois avant impôt, {h} h par mois.',
  'You missed your interview at {employer}. Apply again when you can go.':
    'Vous avez manqué votre entretien chez {employer}. Postulez de nouveau quand vous pourrez y aller.',
  '{employer} let you go after three strikes. Your salary has stopped; two weeks’ notice pay is {amount} before tax.':
    '{employer} vous a licencié après trois avertissements. Votre salaire s’arrête ; deux semaines de préavis font {amount} avant impôt.',
  '{n} work tasks went unanswered last month: they count as a strike.':
    '{n} tâches professionnelles sont restées sans réponse le mois dernier : elles comptent comme un avertissement.',
  'Appointment confirmed at {place}: {when}. Go in person from then; it lapses after a month.':
    'Rendez-vous confirmé à {place} : {when}. Présentez-vous en personne à partir de là ; il expire au bout d’un mois.',
  // ---- Friends, events, holidays, games
  '{name} invited you over.': '{name} vous a invité chez lui.',
  '{name} invited you over to their place in {city}.': '{name} vous a invité chez lui à {city}.',
  '{name} can’t come over this time.': '{name} ne peut pas venir cette fois.',
  '{name} wants to hang out at {place} {when}.': '{name} veut vous retrouver à {place} {when}.',
  '{name} joined you at {place}.': '{name} vous a rejoint à {place}.',
  '{name} ({firm}) liked your pitch at {event}. A warm intro is waiting.':
    '{name} ({firm}) a aimé votre pitch à {event}. Une introduction vous attend.',
  'You sent {amount} to {name} (fee {fee}).': 'Vous avez envoyé {amount} à {name} (frais {fee}).',
  '{name} sent you {amount}{note}': '{name} vous a envoyé {amount}{note}',
  '{event} is coming to {city}.': '{event} arrive à {city}.',
  '{event} was cancelled.{refund}': '{event} a été annulé.{refund}',
  '{event}: {summary} You made {n} contacts.{stars}':
    '{event} : {summary} Vous avez noué {n} contacts.{stars}',
  '{name} came over to say hello in the lounge.': '{name} est venu vous saluer dans le salon.',
  '{name} relocated and left {company}. You’re running it now.':
    '{name} a déménagé et quitté {company}. C’est vous qui la dirigez maintenant.',
  'Welcome to {city}. You arrived with {amount}; half of everything stayed with the central bank in {from}.':
    'Bienvenue à {city}. Vous êtes arrivé avec {amount} ; la moitié de tout est restée à la banque centrale de {from}.',
  '{name} invited you on holiday to {place} (month {month}){who}. {pays}':
    '{name} vous a invité en vacances à {place} (mois {month}){who}. {pays}',
  '{name} is coming to {place} with you.': '{name} vient à {place} avec vous.',
  '{name} can’t come to {place} this time.': '{name} ne peut pas venir à {place} cette fois.',
  '{name} wants to go to {place} together. Join them from your holiday.':
    '{name} veut aller à {place} avec vous. Rejoignez-le depuis vos vacances.',
  '{name} joined you at {place}. Holiday together: happier, less stressed.':
    '{name} vous a rejoint à {place}. Des vacances ensemble : plus heureux, moins stressés.',
  '{name} is knocking on your door{room}.': '{name} frappe à votre porte{room}.',
  '{name} opened the door and came over to your room.':
    '{name} a ouvert la porte et est venu dans votre chambre.',
  '{name} said goodbye. You’re back in your room.':
    '{name} vous a dit au revoir. Vous êtes de retour dans votre chambre.',
  '{name} went back to {room}.': '{name} est retourné dans {room}.',
  '{name} invites you to go shopping at the mall in {city}.':
    '{name} vous invite à faire du shopping au centre commercial de {city}.',
  '{name} can’t come shopping this time.': '{name} ne peut pas venir faire du shopping cette fois.',
  '{name} is coming shopping with you.': '{name} vient faire du shopping avec vous.',
  '{name} headed off from the mall.': '{name} a quitté le centre commercial.',
  '{name} bought you a gift at the mall: {gift}.':
    '{name} vous a offert un cadeau au centre commercial : {gift}.',
  '{name} wants to give you a home: the {home} in {city}.':
    '{name} veut vous offrir un logement : {home} à {city}.',
  '{name} accepted your gift: the {home}.': '{name} a accepté votre cadeau : {home}.',
  '{name} took back their offer of a home.': '{name} a retiré son offre de logement.',
  '{name} declined your gift of a home.': '{name} a refusé votre cadeau de logement.',
  '{name} invites you to {game} at {place}: {stake} each, winner takes the pot.':
    '{name} vous invite à {game} à {place} : {stake} chacun, le gagnant remporte la mise.',
  '{name} invites you to {game} at {place}.': '{name} vous invite à {game} à {place}.',
  'Nobody answered your invitation to {game} in 30 minutes. {more}':
    'Personne n’a répondu à votre invitation à {game} en 30 minutes. {more}',
  '{name}’s invitation to {game} has expired.': 'L’invitation de {name} à {game} a expiré.',
  'Your {stake} stake is back.': 'Votre mise de {stake} vous est rendue.',
  '{name} declined your invitation to {game}.{more}':
    '{name} a décliné votre invitation à {game}.{more}',
  '{name} declined your golf match. Your {stake} stake is back.':
    '{name} a décliné votre partie de golf. Votre mise de {stake} vous est rendue.',
  '{name} accepted your invitation to {game}: they’re at the table.':
    '{name} a accepté votre invitation à {game} : il est à la table.',
  '{name} invites you to golf at {place}: {stake} each, winner takes the pot.':
    '{name} vous invite au golf à {place} : {stake} chacun, le gagnant remporte la mise.',
  '{name} invites you to a round of golf at {place}.':
    '{name} vous invite à une partie de golf à {place}.',
  // ---- Friends & Family, syndicates
  '{name} opened a Friends & Family round for {company}. Back them on a SAFE in Money → Friends & Family.':
    '{name} a ouvert un tour Friends & Family pour {company}. Soutenez-le avec un SAFE dans Argent → Friends & Family.',
  '{name} committed to your Friends & Family round for {company}.':
    '{name} s’est engagé dans votre tour Friends & Family pour {company}.',
  '{company} closed its Friends & Family round. You hold a SAFE for your commitment.':
    '{company} a clôturé son tour Friends & Family. Vous détenez un SAFE pour votre engagement.',
  '{company} cancelled its Friends & Family round. Your money is back.':
    '{company} a annulé son tour Friends & Family. Votre argent vous est rendu.',
  '{name} is leading a syndicate into {company} and invites backers (from {min}, {pct}% carry). It closes at month end.':
    '{name} mène un syndicat dans {company} et invite des participants (à partir de {min}, {pct} % de carried). Il se clôt en fin de mois.',
  '{name} backed your {company} syndicate with {amount}.':
    '{name} a soutenu votre syndicat {company} avec {amount}.',
  '{syndicate} closed: {amount} of yours is in {company}.':
    '{syndicate} est clôturé : {amount} de votre argent sont investis dans {company}.',
  '{syndicate} paid out: {amount} to you after {carry} carry.':
    '{syndicate} a distribué : {amount} pour vous après {carry} de carried.',
  '{syndicate} paid out {amount}. Your carry: {carry}.':
    '{syndicate} a distribué {amount}. Votre carried : {carry}.',
  '{name} can’t come over right now.': '{name} ne peut pas venir pour l’instant.',
  '{name} is coming over.': '{name} arrive chez vous.',
  'Deal closed: {client}': 'Opération conclue : {client}',
  '{done} Your mentor is {mentor}. Demo day: {date}.':
    '{done} Votre mentor est {mentor}. Demo day : {date}.',
  '{name} is in: {amount} for {pct}% on a SAFE.':
    '{name} entre au capital : {amount} pour {pct} % sur un SAFE.',
  // ---- A business co-founder's investor introductions (intros.ts)
  '{name} introduced you to {partner} at {fund}: a warm lead in your investor list.':
    '{name} vous a présenté à {partner}, chez {fund} : une piste chaude dans votre liste d’investisseurs.',
  '{name} introduced you to {n} investors who fit your round: {funds}. They’re warm leads in your investor list.':
    '{name} vous a présenté à {n} investisseurs adaptés à votre tour : {funds}. Ce sont des pistes chaudes dans votre liste d’investisseurs.',
  // ---- Generic
  '{name}: {text}': '{name} : {text}',
};
