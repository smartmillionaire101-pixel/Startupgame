/**
 * Customer interviews in each industry's own words (player feedback: "the
 * questions… are just focus on fintech so when I select health tech it just
 * give me the same questions… If I select a health tech my client base needs
 * have to be different same if I select logistics"). The questions of every
 * round and what people say to the weak ones, per industry: a clinic hears
 * about patients and waiting rooms, a courier about drivers and lost parcels.
 * What each segment's people say to the best questions, and the question to
 * ask next time, are the segment's own (./customer-interviews.ts).
 *
 * Per round (0 the problem, 1 what they do and pay today, 2 what would make
 * them switch) and kind: the best question (round 0's also has the
 * segment's own wording, first), and one each of the weak kinds. Same
 * placeholders as the segments: {price}, {benefit}.
 */
import type { Industry } from './industries.js';
import type { Line, QuestionKind } from './customer-interviews.js';

const L = (en: string, fr: string): Line => ({ en, fr });

type Weak = Exclude<QuestionKind, 'best'>;

export interface IndustryInterview {
  /** Per round: the wordings of each kind. */
  questions: Record<QuestionKind, Line[]>[];
  /** What anyone in the industry says to a weak question, per round. */
  weak: Record<Weak, Line>[];
  /** The note a broad first question leaves: a feeling, no figure. */
  vague: Line;
  /**
   * The notes a weaker question leaves in rounds 2 and 3 (what they pay now,
   * what would make them switch): something, but no figure and no reason.
   */
  vaguePays: Line;
  vagueSwitch: Line;
}

// prettier-ignore
export const INDUSTRY_INTERVIEWS: Record<Industry, IndustryInterview> = {
  fintech: {
    questions: [
      {
        best: [L('Tell me about the last time a payment went wrong. What happened?', 'Racontez-moi la dernière fois qu’un paiement s’est mal passé. Qu’est-ce qui est arrivé ?')],
        broad: [L('What’s the hardest part of handling the money?', 'Qu’est-ce qui est le plus dur, avec l’argent de l’activité ?')],
        yesno: [L('Do your customers pay by transfer?', 'Vos clients paient par virement ?')],
        leading: [L('Chasing payments must be a nightmare, isn’t it?', 'Relancer les paiements, ça doit être un cauchemar, non ?')],
        early: [L('Would you pay {price} a month for an app that {benefit}?', 'Vous paieriez {price} par mois pour une appli qui {benefit} ?')],
      },
      {
        best: [
          L('What have you tried to keep track of payments, and why did you stop?', 'Qu’avez-vous essayé pour suivre les paiements, et pourquoi avoir arrêté ?'),
          L('How do you handle it today, and what does that cost you?', 'Comment faites-vous aujourd’hui, et combien ça vous coûte ?'),
        ],
        broad: [L('What would your perfect payment tool do?', 'Que ferait l’outil de paiement idéal, pour vous ?')],
        yesno: [L('Have you ever used a payments app?', 'Vous avez déjà utilisé une appli de paiement ?')],
        leading: [L('So an app that {benefit} would help, right?', 'Donc une appli qui {benefit} vous aiderait, non ?')],
        early: [L('Can I sign you up for our pilot today?', 'Je peux vous inscrire à notre pilote aujourd’hui ?')],
      },
      {
        best: [
          L('What would have to happen for you to change how you get paid?', 'Que faudrait-il pour que vous changiez votre façon d’être payé ?'),
          L('If you could change one thing about your payments tomorrow, what would it be?', 'Si vous pouviez changer une chose à vos paiements demain, ce serait quoi ?'),
        ],
        broad: [L('Which features matter most to you?', 'Quelles fonctions comptent le plus pour vous ?')],
        yesno: [L('Do you trust apps with your money?', 'Vous faites confiance aux applis pour votre argent ?')],
        leading: [L('You’d switch to something better, wouldn’t you?', 'Vous changeriez pour quelque chose de mieux, non ?')],
        early: [L('Would you pay {price} a month for it?', 'Vous paieriez {price} par mois pour ça ?')],
      },
    ],
    weak: [
      {
        broad: L('“Everything? Late payers, cash, the bank. It’s just hard.”', '« Tout ? Les retards de paiement, le liquide, la banque. C’est dur, c’est tout. »'),
        yesno: L('“Some do.” A pause.', '« Certains. » Un silence.'),
        leading: L('“Yes, a nightmare.” They smile, waiting.', '« Oui, un cauchemar. » Un sourire, et on attend la suite.'),
        early: L('“Maybe… yes, why not. I’d have to see it.”', '« Peut-être… oui, pourquoi pas. Il faudrait voir. »'),
      },
      {
        broad: L('“Something simple. Cheap. That doesn’t lose my money.”', '« Un truc simple. Pas cher. Qui ne perd pas mon argent. »'),
        yesno: L('“Once. I stopped.” They don’t say why.', '« Une fois. J’ai arrêté. » Sans dire pourquoi.'),
        leading: L('“I suppose so… if it’s simple.”', '« Je suppose… si c’est simple. »'),
        early: L('“Ehh, let me think about it. Come back next week.”', '« Euh, laissez-moi réfléchir. Revenez la semaine prochaine. »'),
      },
      {
        broad: L('“All of them? Whatever is easy.”', '« Toutes ? Ce qui est facile. »'),
        yesno: L('“Maybe. If it’s safe.”', '« Peut-être. Si c’est sûr. »'),
        leading: L('“Yes, yes. Something better, of course.”', '« Oui, oui. Quelque chose de mieux, bien sûr. »'),
        early: L('“Yes… {price} sounds fine.” They don’t meet your eye.', '« Oui… {price}, ça va. » Le regard fuit le vôtre.'),
      },
    ],
    vague: L('“Everything is hard” (no figure)', '« Tout est dur » (aucun chiffre)'),
    vaguePays: L('Uses “something”: no cost, no reason it fails', 'Utilise « quelque chose » : aucun coût, aucune raison de l’échec'),
    vagueSwitch: L('“Something simple and safe” (no test you could pass)', '« Un truc simple et sûr » (aucun critère précis)'),
  },
  ecommerce: {
    questions: [
      {
        best: [L('Tell me about the last order that went wrong. What happened?', 'Racontez-moi la dernière commande qui a mal tourné. Qu’est-ce qui est arrivé ?')],
        broad: [L('What’s the hardest part of buying or selling online?', 'Qu’est-ce qui est le plus dur, pour acheter ou vendre en ligne ?')],
        yesno: [L('Do you order things online?', 'Vous commandez en ligne ?')],
        leading: [L('Shopping online is a hassle, isn’t it?', 'Acheter en ligne, c’est la galère, non ?')],
        early: [L('Would you pay {price} a month for an app that {benefit}?', 'Vous paieriez {price} par mois pour une appli qui {benefit} ?')],
      },
      {
        best: [
          L('What have you tried instead, and why did you stop?', 'Qu’avez-vous essayé d’autre, et pourquoi avoir arrêté ?'),
          L('How do you get your orders today, and what does that cost you?', 'Comment passez-vous vos commandes aujourd’hui, et combien ça vous coûte ?'),
        ],
        broad: [L('What would the perfect shop do?', 'Que ferait la boutique idéale ?')],
        yesno: [L('Have you used a shopping app before?', 'Vous avez déjà utilisé une appli d’achat ?')],
        leading: [L('So an app that {benefit} would help, right?', 'Donc une appli qui {benefit} vous aiderait, non ?')],
        early: [L('Can I put you down for the first version?', 'Je vous note pour la première version ?')],
      },
      {
        best: [
          L('What would make you change where you buy, or sell?', 'Qu’est-ce qui vous ferait changer d’endroit où acheter, ou vendre ?'),
          L('If you could change one thing about ordering tomorrow, what would it be?', 'Si vous pouviez changer une chose aux commandes demain, ce serait quoi ?'),
        ],
        broad: [L('What makes a good shop for you?', 'C’est quoi, une bonne boutique, pour vous ?')],
        yesno: [L('Would you try a new shopping app?', 'Vous essaieriez une nouvelle appli d’achat ?')],
        leading: [L('Everyone will shop on apps soon, don’t you think?', 'Tout le monde achètera sur appli bientôt, vous ne croyez pas ?')],
        early: [L('Would you pay {price} a month for it?', 'Vous paieriez {price} par mois pour ça ?')],
      },
    ],
    weak: [
      {
        broad: L('“Hm. Prices, fakes, returns. Everything.”', '« Hum. Les prix, les contrefaçons, les retours. Tout. »'),
        yesno: L('“Yes, sometimes.”', '« Oui, parfois. »'),
        leading: L('“Yes, a hassle.” A shrug.', '« Oui, la galère. » Un haussement d’épaules.'),
        early: L('“Maybe… if it’s cheap.”', '« Peut-être… si c’est pas cher. »'),
      },
      {
        broad: L('“Cheap. Fast. Easy.”', '« Pas cher. Rapide. Facile. »'),
        yesno: L('“Yes, a few.”', '« Oui, quelques-unes. »'),
        leading: L('“I suppose… if it arrives.”', '« Je suppose… si ça arrive. »'),
        early: L('“Let me see it first.”', '« Montrez-moi d’abord. »'),
      },
      {
        broad: L('“Good prices, I guess.”', '« De bons prix, je suppose. »'),
        yesno: L('“Maybe. If my friends use it.”', '« Peut-être. Si mes amis l’utilisent. »'),
        leading: L('“Sure, sure.”', '« Oui, oui. »'),
        early: L('“{price}? …Maybe.” They glance at the door.', '« {price} ? … Peut-être. » Un regard vers la porte.'),
      },
    ],
    vague: L('“Prices, fakes, returns” (no figure)', '« Les prix, les contrefaçons, les retours » (aucun chiffre)'),
    vaguePays: L('Buys “the usual way”: no cost, no story', 'Achète « comme d’habitude » : aucun coût, aucune histoire'),
    vagueSwitch: L('“Cheaper and easier” (no test you could pass)', '« Moins cher et plus simple » (aucun critère précis)'),
  },
  logistics: {
    questions: [
      {
        best: [L('Tell me about the last delivery that went wrong. What happened?', 'Racontez-moi la dernière livraison qui a mal tourné. Qu’est-ce qui est arrivé ?')],
        broad: [L('What’s the hardest part of getting things delivered?', 'Qu’est-ce qui est le plus dur, pour faire livrer ?')],
        yesno: [L('Do you use dispatch riders?', 'Vous faites appel à des coursiers ?')],
        leading: [L('Drivers are always late, aren’t they?', 'Les chauffeurs sont toujours en retard, non ?')],
        early: [L('Would you pay {price} a month for a service that {benefit}?', 'Vous paieriez {price} par mois pour un service qui {benefit} ?')],
      },
      {
        best: [
          L('What have you tried for deliveries, and why did you stop?', 'Qu’avez-vous essayé pour les livraisons, et pourquoi avoir arrêté ?'),
          L('How do parcels go out today, and what does each trip cost you?', 'Comment partent les colis aujourd’hui, et combien vous coûte chaque trajet ?'),
        ],
        broad: [L('What would the perfect delivery service do?', 'Que ferait le service de livraison idéal ?')],
        yesno: [L('Have you ever used a delivery app?', 'Vous avez déjà utilisé une appli de livraison ?')],
        leading: [L('So a service that {benefit} would help, right?', 'Donc un service qui {benefit} vous aiderait, non ?')],
        early: [L('Can I book your first pickup today?', 'Je peux réserver votre premier enlèvement aujourd’hui ?')],
      },
      {
        best: [
          L('What would have to happen for you to change who delivers for you?', 'Que faudrait-il pour que vous changiez de livreur ?'),
          L('If you could fix one thing about deliveries tomorrow, what would it be?', 'Si vous pouviez régler une chose aux livraisons demain, ce serait quoi ?'),
        ],
        broad: [L('What matters most in a delivery partner?', 'Qu’est-ce qui compte le plus chez un livreur ?')],
        yesno: [L('Would you try a new courier?', 'Vous essaieriez un nouveau coursier ?')],
        leading: [L('Tracking is what everyone wants now, don’t you think?', 'Le suivi, c’est ce que tout le monde veut maintenant, non ?')],
        early: [L('Would you pay {price} a month for it?', 'Vous paieriez {price} par mois pour ça ?')],
      },
    ],
    weak: [
      {
        broad: L('“Traffic, fuel, drivers who don’t answer. Everything.”', '« Les bouchons, le carburant, les chauffeurs qui ne répondent pas. Tout. »'),
        yesno: L('“Yes. Sometimes.”', '« Oui. Parfois. »'),
        leading: L('“Always late, yes.” They wait for more.', '« Toujours en retard, oui. » On attend la suite.'),
        early: L('“Maybe… depends on the price per trip.”', '« Peut-être… ça dépend du prix par trajet. »'),
      },
      {
        broad: L('“On time. Cheap. That’s all.”', '« À l’heure. Pas cher. C’est tout. »'),
        yesno: L('“Once or twice.”', '« Une ou deux fois. »'),
        leading: L('“I suppose… if the parcels arrive.”', '« Je suppose… si les colis arrivent. »'),
        early: L('“Not today. Let me think about it.”', '« Pas aujourd’hui. Laissez-moi réfléchir. »'),
      },
      {
        broad: L('“Whatever arrives on time.”', '« Ce qui arrive à l’heure. »'),
        yesno: L('“Maybe. If they don’t lose things.”', '« Peut-être. S’ils ne perdent rien. »'),
        leading: L('“Yes, yes, tracking, of course.”', '« Oui, oui, le suivi, bien sûr. »'),
        early: L('“{price}… fine, yes.” They don’t sound sure.', '« {price}… d’accord, oui. » Sans conviction.'),
      },
    ],
    vague: L('“Traffic, fuel, drivers” (no figure)', '« Bouchons, carburant, chauffeurs » (aucun chiffre)'),
    vaguePays: L('Uses “a rider they know”: no cost, no failure named', 'Utilise « un livreur qu’il connaît » : aucun coût, aucun échec cité'),
    vagueSwitch: L('“On time, not too dear” (no test you could pass)', '« À l’heure, pas trop cher » (aucun critère précis)'),
  },
  healthtech: {
    questions: [
      {
        best: [L('Tell me about the last time getting care went wrong. What happened?', 'Racontez-moi la dernière fois qu’obtenir des soins s’est mal passé. Qu’est-ce qui est arrivé ?')],
        broad: [L('What’s the hardest part of healthcare for you?', 'Qu’est-ce qui est le plus dur, avec les soins, pour vous ?')],
        yesno: [L('Do you use the same clinic every time?', 'Vous allez toujours dans le même dispensaire ?')],
        leading: [L('Clinic queues must be terrible, aren’t they?', 'Les files d’attente au dispensaire, ça doit être terrible, non ?')],
        early: [L('Would you pay {price} a month for a service that {benefit}?', 'Vous paieriez {price} par mois pour un service qui {benefit} ?')],
      },
      {
        best: [
          L('What have you tried to make it better, and why did you stop?', 'Qu’avez-vous essayé pour que ça aille mieux, et pourquoi avoir arrêté ?'),
          L('What happens today, from the appointment to the bill, and what does it cost?', 'Comment ça se passe aujourd’hui, du rendez-vous à la facture, et combien ça coûte ?'),
        ],
        broad: [L('What would perfect healthcare look like for you?', 'À quoi ressembleraient des soins parfaits, pour vous ?')],
        yesno: [L('Have you ever used a health app?', 'Vous avez déjà utilisé une appli de santé ?')],
        leading: [L('So a service that {benefit} would help, right?', 'Donc un service qui {benefit} vous aiderait, non ?')],
        early: [L('Can I sign you up for a free trial today?', 'Je peux vous inscrire à un essai gratuit aujourd’hui ?')],
      },
      {
        best: [
          L('What would have to happen for you to trust something new with patients’ health?', 'Que faudrait-il pour que vous confiiez la santé des patients à quelque chose de nouveau ?'),
          L('If you could change one thing about seeing a doctor tomorrow, what would it be?', 'Si vous pouviez changer une chose à la consultation demain, ce serait quoi ?'),
        ],
        broad: [L('What matters most to you in a doctor or a clinic?', 'Qu’est-ce qui compte le plus, chez un médecin ou une clinique ?')],
        yesno: [L('Would you trust a doctor over the phone?', 'Vous feriez confiance à un médecin au téléphone ?')],
        leading: [L('Everyone will see doctors online soon, don’t you think?', 'Tout le monde consultera en ligne bientôt, vous ne croyez pas ?')],
        early: [L('Would you pay {price} a month for it?', 'Vous paieriez {price} par mois pour ça ?')],
      },
    ],
    weak: [
      {
        broad: L('“Waiting. Paying. Waiting again. It’s all hard.”', '« Attendre. Payer. Attendre encore. Tout est dur. »'),
        yesno: L('“Mostly, yes.”', '« La plupart du temps, oui. »'),
        leading: L('“Terrible, yes.” A nod, and they wait.', '« Terrible, oui. » Un hochement de tête, et on attend.'),
        early: L('“Maybe… if the doctors are real.”', '« Peut-être… si les médecins sont des vrais. »'),
      },
      {
        broad: L('“Quick. Not too dear. A real doctor.”', '« Rapide. Pas trop cher. Un vrai médecin. »'),
        yesno: L('“Once. It wasn’t great.” Nothing more.', '« Une fois. C’était pas terrible. » Rien de plus.'),
        leading: L('“I suppose… if it’s a real doctor.”', '« Je suppose… si c’est un vrai médecin. »'),
        early: L('“Let me think about it. Come back next week.”', '« Laissez-moi réfléchir. Revenez la semaine prochaine. »'),
      },
      {
        broad: L('“Good doctors, I suppose.”', '« De bons médecins, je suppose. »'),
        yesno: L('“Maybe. It depends who it is.”', '« Peut-être. Ça dépend qui. »'),
        leading: L('“Yes, probably, one day.”', '« Oui, sans doute, un jour. »'),
        early: L('“{price}… yes, OK.” They glance at the clock.', '« {price}… oui, d’accord. » Un regard vers l’horloge.'),
      },
    ],
    vague: L('“Waiting and more waiting” (no figure)', '« Attendre, encore attendre » (aucun chiffre)'),
    vaguePays: L('Gets by “somehow”: no cost, no story', 'Se débrouille « comme on peut » : aucun coût, aucune histoire'),
    vagueSwitch: L('“If it’s a real doctor” (no test you could pass)', '« Si c’est un vrai médecin » (aucun critère précis)'),
  },
  edtech: {
    questions: [
      {
        best: [L('Tell me about the last time a course or an exam went badly. What happened?', 'Racontez-moi la dernière fois qu’un cours ou un examen s’est mal passé. Qu’est-ce qui est arrivé ?')],
        broad: [L('What’s the hardest part of learning, or teaching, here?', 'Qu’est-ce qui est le plus dur, pour apprendre ou enseigner, ici ?')],
        yesno: [L('Do you use a phone for lessons?', 'Vous utilisez un téléphone pour les cours ?')],
        leading: [L('Exams are so stressful, aren’t they?', 'Les examens, c’est tellement stressant, non ?')],
        early: [L('Would you pay {price} a month for an app that {benefit}?', 'Vous paieriez {price} par mois pour une appli qui {benefit} ?')],
      },
      {
        best: [
          L('What have you tried to help with that, and why did you stop?', 'Qu’avez-vous essayé pour ça, et pourquoi avoir arrêté ?'),
          L('What do you do about it today, lessons, tutors, books, and what does it cost?', 'Que faites-vous pour ça aujourd’hui, cours, répétiteurs, livres, et combien ça coûte ?'),
        ],
        broad: [L('What would the perfect learning app do?', 'Que ferait l’appli d’apprentissage idéale ?')],
        yesno: [L('Have you ever paid for extra lessons?', 'Vous avez déjà payé des cours en plus ?')],
        leading: [L('So an app that {benefit} would help, right?', 'Donc une appli qui {benefit} vous aiderait, non ?')],
        early: [L('Can I sign you up for the first term today?', 'Je peux vous inscrire pour le premier trimestre aujourd’hui ?')],
      },
      {
        best: [
          L('What would have to happen for you to change how you learn, or teach?', 'Que faudrait-il pour que vous changiez votre façon d’apprendre, ou d’enseigner ?'),
          L('If you could change one thing about lessons tomorrow, what would it be?', 'Si vous pouviez changer une chose aux cours demain, ce serait quoi ?'),
        ],
        broad: [L('Which subjects matter most to you?', 'Quelles matières comptent le plus pour vous ?')],
        yesno: [L('Would you try a new learning app?', 'Vous essaieriez une nouvelle appli d’apprentissage ?')],
        leading: [L('Everyone will learn on their phone soon, don’t you think?', 'Tout le monde apprendra sur son téléphone bientôt, vous ne croyez pas ?')],
        early: [L('Would you pay {price} a month for it?', 'Vous paieriez {price} par mois pour ça ?')],
      },
    ],
    weak: [
      {
        broad: L('“Fees, time, exams. All of it.”', '« Les frais, le temps, les examens. Tout. »'),
        yesno: L('“Sometimes.”', '« Parfois. »'),
        leading: L('“Very stressful, yes.” A polite smile.', '« Très stressant, oui. » Un sourire poli.'),
        early: L('“Maybe… if the results go up.”', '« Peut-être… si les résultats montent. »'),
      },
      {
        broad: L('“Something that works on my phone.”', '« Un truc qui marche sur mon téléphone. »'),
        yesno: L('“Yes, a bit.”', '« Oui, un peu. »'),
        leading: L('“I suppose… if it helps the grades.”', '« Je suppose… si ça aide les notes. »'),
        early: L('“After the exams, maybe.”', '« Après les examens, peut-être. »'),
      },
      {
        broad: L('“Maths, I suppose. All of them.”', '« Les maths, je suppose. Toutes. »'),
        yesno: L('“Maybe. If it’s free to try.”', '« Peut-être. Si l’essai est gratuit. »'),
        leading: L('“Yes, probably.”', '« Oui, sans doute. »'),
        early: L('“{price}… OK, yes.” They’re already packing up.', '« {price}… d’accord, oui. » On range déjà ses affaires.'),
      },
    ],
    vague: L('“Fees, time, exams” (no figure)', '« Les frais, le temps, les examens » (aucun chiffre)'),
    vaguePays: L('Pays “a bit” for lessons: no figure, no story', 'Paie « un peu » pour des cours : aucun chiffre, aucune histoire'),
    vagueSwitch: L('“If it helps the results” (no test you could pass)', '« Si ça aide les résultats » (aucun critère précis)'),
  },
  saas: {
    questions: [
      {
        best: [L('Tell me about the last time the admin side went wrong. What happened?', 'Racontez-moi la dernière fois que l’administratif a déraillé. Qu’est-ce qui est arrivé ?')],
        broad: [L('What’s the hardest part of the office side of things?', 'Qu’est-ce qui est le plus dur, côté bureau ?')],
        yesno: [L('Do you run the business on spreadsheets?', 'Vous gérez l’activité sur des tableurs ?')],
        leading: [L('Admin eats your whole week, doesn’t it?', 'L’administratif vous mange toute la semaine, non ?')],
        early: [L('Would you pay {price} a month for software that {benefit}?', 'Vous paieriez {price} par mois pour un logiciel qui {benefit} ?')],
      },
      {
        best: [
          L('What tools have you tried for that, and why did you stop?', 'Quels outils avez-vous essayés pour ça, et pourquoi avoir arrêté ?'),
          L('How is it done today, and how many hours does it cost the team?', 'Comment ça se fait aujourd’hui, et combien d’heures ça coûte à l’équipe ?'),
        ],
        broad: [L('What would your perfect tool do?', 'Que ferait l’outil idéal, pour vous ?')],
        yesno: [L('Do you pay for any software now?', 'Vous payez un logiciel en ce moment ?')],
        leading: [L('So software that {benefit} would help, right?', 'Donc un logiciel qui {benefit} vous aiderait, non ?')],
        early: [L('Can I set you up on a trial today?', 'Je peux vous ouvrir un essai aujourd’hui ?')],
      },
      {
        best: [
          L('What would have to happen for you to switch tools?', 'Que faudrait-il pour que vous changiez d’outil ?'),
          L('If you could fix one thing about your tools tomorrow, what would it be?', 'Si vous pouviez régler une chose à vos outils demain, ce serait quoi ?'),
        ],
        broad: [L('Which features matter most to you?', 'Quelles fonctions comptent le plus pour vous ?')],
        yesno: [L('Would you try new software?', 'Vous essaieriez un nouveau logiciel ?')],
        leading: [L('Everyone is moving to the cloud, don’t you think?', 'Tout le monde passe au cloud, vous ne croyez pas ?')],
        early: [L('Would you pay {price} a month for it?', 'Vous paieriez {price} par mois pour ça ?')],
      },
    ],
    weak: [
      {
        broad: L('“Time. There’s never enough. Everything.”', '« Le temps. Il n’y en a jamais assez. Tout. »'),
        yesno: L('“Yes, a few.”', '« Oui, quelques-uns. »'),
        leading: L('“All week, yes.” They wait.', '« Toute la semaine, oui. » On attend.'),
        early: L('“Maybe. Send me a link.”', '« Peut-être. Envoyez-moi un lien. »'),
      },
      {
        broad: L('“Simple. Cheap. Works on my phone.”', '« Simple. Pas cher. Ça marche sur mon téléphone. »'),
        yesno: L('“A couple of things.”', '« Deux ou trois trucs. »'),
        leading: L('“I suppose… if it saves time.”', '« Je suppose… si ça fait gagner du temps. »'),
        early: L('“Let me check with the team.”', '« Je vois avec l’équipe. »'),
      },
      {
        broad: L('“Whatever saves time.”', '« Ce qui fait gagner du temps. »'),
        yesno: L('“Maybe, if it’s easy to move.”', '« Peut-être, si c’est facile de migrer. »'),
        leading: L('“Sure, the cloud.”', '« Bien sûr, le cloud. »'),
        early: L('“{price}… sounds fine.” They check their phone.', '« {price}… ça me va. » Un coup d’œil au téléphone.'),
      },
    ],
    vague: L('“Never enough time” (no figure)', '« Jamais assez de temps » (aucun chiffre)'),
    vaguePays: L('Uses “spreadsheets and things”: no cost, no story', 'Utilise « des tableurs et tout ça » : aucun coût, aucune histoire'),
    vagueSwitch: L('“If it saves time” (no test you could pass)', '« Si ça fait gagner du temps » (aucun critère précis)'),
  },
  agritech: {
    questions: [
      {
        best: [L('Tell me about the last time produce went to waste. What happened?', 'Racontez-moi la dernière fois que des produits ont été perdus. Qu’est-ce qui est arrivé ?')],
        broad: [L('What’s the hardest part of your season?', 'Qu’est-ce qui est le plus dur, dans votre saison ?')],
        yesno: [L('Do you deal with middlemen?', 'Vous passez par des intermédiaires ?')],
        leading: [L('Middlemen take too much, don’t they?', 'Les intermédiaires prennent trop, non ?')],
        early: [L('Would you pay {price} a month for a service that {benefit}?', 'Vous paieriez {price} par mois pour un service qui {benefit} ?')],
      },
      {
        best: [
          L('What have you tried to get better prices, and why did you stop?', 'Qu’avez-vous essayé pour avoir de meilleurs prix, et pourquoi avoir arrêté ?'),
          L('How do you buy or sell today, and what does it cost you?', 'Comment achetez-vous ou vendez-vous aujourd’hui, et combien ça vous coûte ?'),
        ],
        broad: [L('What would the perfect market look like for you?', 'À quoi ressemblerait le marché idéal, pour vous ?')],
        yesno: [L('Have you ever bought or sold produce through an app?', 'Vous avez déjà acheté ou vendu des produits par une appli ?')],
        leading: [L('So a service that {benefit} would help, right?', 'Donc un service qui {benefit} vous aiderait, non ?')],
        early: [L('Can I sign you up before the next harvest?', 'Je peux vous inscrire avant la prochaine récolte ?')],
      },
      {
        best: [
          L('What would have to happen for you to change who you buy from, or sell to?', 'Que faudrait-il pour que vous changiez de fournisseur, ou d’acheteur ?'),
          L('If you could change one thing about the season tomorrow, what would it be?', 'Si vous pouviez changer une chose à la saison demain, ce serait quoi ?'),
        ],
        broad: [L('What matters most to you in a buyer or a supplier?', 'Qu’est-ce qui compte le plus, chez un acheteur ou un fournisseur ?')],
        yesno: [L('Would you try someone new?', 'Vous essaieriez quelqu’un de nouveau ?')],
        leading: [L('Farming is all going digital, don’t you think?', 'L’agriculture passe au numérique, vous ne croyez pas ?')],
        early: [L('Would you pay {price} a month for it?', 'Vous paieriez {price} par mois pour ça ?')],
      },
    ],
    weak: [
      {
        broad: L('“Rain, prices, transport. All of it.”', '« La pluie, les prix, le transport. Tout. »'),
        yesno: L('“Sometimes, yes.”', '« Parfois, oui. »'),
        leading: L('“Too much, yes.” A nod, and they wait.', '« Trop, oui. » Un hochement de tête, et on attend.'),
        early: L('“After the harvest, maybe.”', '« Après la récolte, peut-être. »'),
      },
      {
        broad: L('“Fair prices. On time.”', '« Des prix justes. À l’heure. »'),
        yesno: L('“My nephew showed me one.” That’s all.', '« Mon neveu m’en a montré une. » C’est tout.'),
        leading: L('“I suppose… if they keep their word.”', '« Je suppose… s’ils tiennent parole. »'),
        early: L('“Let me talk to the co-op first.”', '« Je dois d’abord en parler à la coopérative. »'),
      },
      {
        broad: L('“Someone who keeps their word.”', '« Quelqu’un qui tient parole. »'),
        yesno: L('“Maybe. If they come back next season.”', '« Peut-être. S’ils reviennent la saison prochaine. »'),
        leading: L('“Yes, probably.”', '« Oui, sans doute. »'),
        early: L('“{price}… yes.” They look away.', '« {price}… oui. » Le regard se détourne.'),
      },
    ],
    vague: L('“Rain, prices, transport” (no figure)', '« La pluie, les prix, le transport » (aucun chiffre)'),
    vaguePays: L('Sells “to whoever comes”: no price, no story', 'Vend « à qui vient » : aucun prix, aucune histoire'),
    vagueSwitch: L('“A better price” (no test you could pass)', '« Un meilleur prix » (aucun critère précis)'),
  },
};
