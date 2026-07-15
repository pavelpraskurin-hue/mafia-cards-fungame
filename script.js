const state = {
  players: 4,
  mafia: 1,
  people: [],
  human: null,
  round: 1,
  phase: "setup",
  investigation: null,
  messages: 0,
  claims: [],
  replying: false,
  usedLines: new Set(),
  lineSerial: 0,
};

const roles = {
  Mafia: { icon: "♠", description: "Choose a target each night. Survive the vote.", color: "#b52d1d" },
  Detective: { icon: "◉", description: "Investigate one player each night.", color: "#aa832d" },
  Doctor: { icon: "✚", description: "Protect one player from the Mafia.", color: "#718c73" },
  Civilian: { icon: "◆", description: "Find the Mafia before they control the town.", color: "#665b4d" },
};

const botProfiles = [
  { name: "Marco", personality: "Logical", initial: "M" },
  { name: "Sofia", personality: "Paranoid", initial: "S" },
  { name: "Luca", personality: "Aggressive", initial: "L" },
  { name: "Elena", personality: "Quiet", initial: "E" },
  { name: "Nico", personality: "Charming", initial: "N" },
  { name: "Rosa", personality: "Observant", initial: "R" },
  { name: "Enzo", personality: "Nervous", initial: "E" },
  { name: "Giulia", personality: "Logical", initial: "G" },
  { name: "Matteo", personality: "Paranoid", initial: "M" },
  { name: "Carla", personality: "Aggressive", initial: "C" },
  { name: "Paolo", personality: "Quiet", initial: "P" },
  { name: "Bianca", personality: "Observant", initial: "B" },
  { name: "Dante", personality: "Charming", initial: "D" },
  { name: "Mia", personality: "Nervous", initial: "M" },
  { name: "Vito", personality: "Logical", initial: "V" },
  { name: "Anna", personality: "Observant", initial: "A" },
  { name: "Salvo", personality: "Aggressive", initial: "S" },
];

const $ = (selector) => document.querySelector(selector);
const setupScreen = $("#setupScreen");
const dealScreen = $("#dealScreen");
const gameScreen = $("#gameScreen");
const endScreen = $("#endScreen");
const roleCard = $("#roleCard");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function recommendedMafia(players) {
  if (players <= 6) return 1;
  if (players <= 10) return 2;
  if (players <= 14) return 3;
  return 4;
}

function updateSetup() {
  const specials = Number($("#detectiveToggle").checked) + Number($("#doctorToggle").checked);
  const maximumMafia = Math.max(1, Math.min(4, Math.floor((state.players - 1) / 2), state.players - specials - 1));
  state.mafia = clamp(state.mafia, 1, maximumMafia);
  $("#playerCount").textContent = state.players;
  $("#playerTotal").textContent = state.players;
  $("#mafiaCount").textContent = state.mafia;
  $("#mafiaHint").textContent = `${recommendedMafia(state.players)} recommended`;
}

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function showScreen(screen) {
  [setupScreen, dealScreen, gameScreen, endScreen].forEach((item) => item.classList.add("hidden"));
  screen.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function createGame() {
  let deck = Array(state.mafia).fill("Mafia");
  if ($("#detectiveToggle").checked) deck.push("Detective");
  if ($("#doctorToggle").checked) deck.push("Doctor");
  while (deck.length < state.players) deck.push("Civilian");
  deck = shuffle(deck);
  state.people = [{ name: "You", personality: "Human", initial: "Y", human: true }, ...botProfiles.slice(0, state.players - 1)]
    .map((person, index) => ({ ...person, role: deck[index], alive: true, suspicion: Math.random() * 1.2, saidLines: new Set(), reads: {} }));
  state.people.forEach((observer) => {
    state.people.forEach((subject) => {
      if (observer !== subject) observer.reads[subject.name] = subject.suspicion + Math.random() * 0.35;
    });
  });
  state.human = state.people[0];
  state.round = 1;
  state.messages = 0;
  state.investigation = null;
  state.claims = [];
  state.replying = false;
  state.usedLines = new Set();
  state.lineSerial = 0;
}

function revealHumanRole() {
  if (roleCard.classList.contains("is-revealed")) return;
  const role = roles[state.human.role];
  $("#roleIcon").textContent = role.icon;
  $("#roleIcon").style.color = role.color;
  $("#roleTitle").textContent = state.human.role.toUpperCase();
  $("#roleDescription").textContent = role.description;
  roleCard.classList.add("is-revealed");
  $("#tapHint").classList.add("hidden");
  $("#nextButton").classList.remove("hidden");
}

function renderRoster() {
  $("#playerRoster").innerHTML = state.people.map((person) => `
    <div class="roster-player ${person.human ? "you" : ""} ${person.alive ? "" : "dead"}">
      <span class="roster-avatar">${person.initial}</span>
      <div><strong>${person.name}${person.human ? " (you)" : ""}</strong><small>${person.human ? "Your role is secret" : person.personality}</small></div>
      <span class="status-dot"></span>
    </div>`).join("");
}

function addMessage(person, text, system = false) {
  const log = $("#chatLog");
  const message = document.createElement("div");
  if (system) {
    message.className = "message system";
    message.innerHTML = `<div class="message-body">${text}</div>`;
  } else {
    message.className = `message ${person.human ? "you" : ""}`;
    message.innerHTML = `<span class="message-avatar">${person.initial}</span><div class="message-body"><div class="message-name">${person.name} · ${person.personality}</div><div class="message-bubble"></div></div>`;
    message.querySelector(".message-bubble").textContent = text;
  }
  log.appendChild(message);
  log.scrollTop = log.scrollHeight;
}

function alivePeople(exclude = null) { return state.people.filter((p) => p.alive && p !== exclude); }
function randomFrom(items) { return items[Math.floor(Math.random() * items.length)]; }

function freshLine(bot, lines) {
  const unused = lines.filter((line) => !bot.saidLines.has(line) && !state.usedLines.has(line));
  let choice = randomFrom(unused);
  if (!choice) {
    const suffixes = [
      "That's my read for now.",
      "I want the town to remember that.",
      "Don't brush that aside.",
      "I am putting that on the record.",
      "Think about it before we vote.",
      "That point still needs an answer.",
    ];
    const combinations = lines.flatMap((line) => suffixes.map((suffix) => `${line} ${suffix}`));
    choice = randomFrom(combinations.filter((line) => !state.usedLines.has(line)));
  }
  // This final branch is extremely rare, but it guarantees that an exact line
  // is never repeated even during a very long match.
  if (!choice) {
    state.lineSerial += 1;
    choice = `${randomFrom(lines)} This is point ${state.lineSerial} in my case.`;
  }
  bot.saidLines.add(choice);
  state.usedLines.add(choice);
  bot.lastLine = choice;
  if (bot.saidLines.size > 30) bot.saidLines.delete(bot.saidLines.values().next().value);
  return choice;
}

function understandMessage(text) {
  const lower = text.toLowerCase();
  const mentioned = state.people.filter((person) => {
    const name = person.name.toLowerCase();
    return name !== "you" && new RegExp(`\\b${name}\\b`, "i").test(lower);
  });
  const defending = /\b(innocent|trust|not mafia|isn't mafia|is not mafia|defend|safe)\b/i.test(lower);
  const accusing = !defending && /\b(think|suspect|suspicious|mafia|guilty|vote|lying|liar|accuse|accusing|hiding|quiet|silent|defensive)\b/i.test(lower);
  const hasEvidence = /\b(because|evidence|proof|noticed|saw|said|changed|contradict|avoided|voted|quiet|silent|defensive|aggressive|lied|lying|acted|behavior|story)\b/i.test(lower);
  const insult = /\b(idiot|stupid|dumb|moron|loser|fool|trash|useless|clown|asshole|bastard|shithead|piece of shit|bitch(?:es)?|fucking bitch|fuck(?:ing)?|fuck you|shut up|idiota|imb[eé]cil|est[uú]pido|gilipollas|cabr[oó]n|mierda)\b/i.test(lower);
  return {
    text,
    target: mentioned[0] || null,
    intent: defending ? "defense" : accusing ? "accusation" : "mention",
    hasEvidence,
    insult,
    isQuestion: text.includes("?"),
  };
}

function evaluatePlayerStatement(conversation) {
  const { target, intent, hasEvidence, insult } = conversation;
  const priorClaims = state.claims.filter((claim) => claim.round === state.round);
  const priorOnTarget = target ? priorClaims.filter((claim) => claim.target === target) : [];
  const contradictedSelf = priorOnTarget.some((claim) => claim.intent !== intent && ["accusation", "defense"].includes(intent));
  const accusedNames = new Set(priorClaims.filter((claim) => claim.intent === "accusation").map((claim) => claim.target?.name));
  const changingTargets = intent === "accusation" && target && !accusedNames.has(target.name) && accusedNames.size >= 2;

  let baseSuspicion = 0.04;
  if (intent === "accusation" && !hasEvidence) baseSuspicion += 0.42;
  if (intent === "accusation" && hasEvidence) baseSuspicion += 0.08;
  if (insult) baseSuspicion += 1.15;
  if (contradictedSelf) baseSuspicion += 0.9;
  if (changingTargets) baseSuspicion += 0.65;
  state.human.suspicion += baseSuspicion;

  state.people.filter((bot) => !bot.human && bot.alive).forEach((bot) => {
    let personalityMultiplier = 1;
    if (bot.personality === "Paranoid") personalityMultiplier = 1.35;
    if (bot.personality === "Logical" && (!hasEvidence || contradictedSelf)) personalityMultiplier = 1.25;
    if (bot.personality === "Observant" && (changingTargets || contradictedSelf)) personalityMultiplier = 1.4;
    if (bot.personality === "Aggressive" && insult) personalityMultiplier = 1.3;
    if (bot.personality === "Charming" && !insult) personalityMultiplier = 0.85;
    bot.reads.You = (bot.reads.You ?? 0) + baseSuspicion * personalityMultiplier;

    if (!target || target === bot) return;
    let targetDelta = 0;
    if (intent === "accusation") targetDelta = hasEvidence ? 0.9 : 0.25;
    if (intent === "defense") targetDelta = -0.3;
    if (bot.personality === "Paranoid") targetDelta *= 1.25;
    if (bot.personality === "Logical" && !hasEvidence) targetDelta *= 0.4;
    if (bot.personality === "Logical" && hasEvidence) targetDelta *= 1.25;
    if (bot.role === "Mafia" && target.role === "Mafia") targetDelta = Math.min(targetDelta, -0.15);
    bot.reads[target.name] = Math.max(0, (bot.reads[target.name] ?? target.suspicion) + targetDelta);
  });
}

function suspectFor(bot) {
  const candidates = alivePeople(bot);
  const legalTargets = bot.role === "Mafia" ? candidates.filter((p) => p.role !== "Mafia") : candidates;
  return [...legalTargets].sort((a, b) => {
    const scoreA = bot.reads[a.name] ?? a.suspicion;
    const scoreB = bot.reads[b.name] ?? b.suspicion;
    return scoreB - scoreA;
  })[0];
}

function insultReply(bot, targeted) {
  const lines = {
    Logical: ["Fuck you. Insults aren't evidence, you piece of shit. Bring an argument.", "Calling me names only proves you have no fucking case. Try thinking for once, bitch.", "That insult was intellectually lazy. Give us facts or shut the fuck up.", "You're a loud, useless piece of shit with no evidence. Make a real argument."],
    Paranoid: ["Keep running your fucking mouth, bitch. You're making yourself look guiltier by the second.", "Fuck you. You insult me because you're scared I can see through your bullshit.", "Call me that again, you piece of shit. I'll make sure you're voted out.", "I knew you were hiding something. Only a guilty bitch lashes out like that."],
    Aggressive: ["Fuck you, you piece of shit. Sit down before you embarrass yourself again.", "Try that insult again after you find a fucking brain and some evidence, bitch.", "You're loud, stupid, and full of shit. That's almost fucking impressive.", "Listen here, bitch: your garbage mouth won't save you when the vote starts."],
    Quiet: ["If insults are all you have, then shut the fuck up, you pathetic bitch.", "Fuck you. Come back when you have an actual argument, you piece of shit.", "I was listening until you replaced reasoning with your fucking garbage.", "You talk like a tough bitch, but your argument is weak as shit."],
    Charming: ["Cute insult, bitch. Shame you couldn't pair it with a coherent fucking thought.", "Was that meant to hurt? Fuck you—your argument is still the embarrassing part.", "Call me names all you want, you piece of shit. It won't make your story believable.", "Such a filthy mouth and still nothing intelligent to say. Tragic, bitch."],
    Observant: ["You insulted me instead of answering, you piece of shit. You're fucking desperate.", "Interesting—you became a raging bitch exactly when your argument fell apart.", "Fuck you. That pathetic outburst told us everything we need to know about you.", "You switched from evidence to bullshit because you know you're losing, bitch."],
    Nervous: ["Back the fuck off, bitch. You're acting like a bully, not an innocent.", "I'm nervous, not fucking stupid. Your insult makes you look like a piece of shit.", "Fuck you. Don't talk to me like that—answer the question, bitch.", "You loudmouthed piece of shit. Stop trying to scare me and prove your case."],
  };
  const pool = lines[bot.personality] || lines.Quiet;
  return freshLine(bot, targeted ? pool : pool.map((line) => `${line} And yes, I mean you.`));
}

function playerSuspicionReply(bot, subject = null) {
  const lines = {
    Logical: ["We should also examine you. Your accusations keep moving without enough evidence.", "The pattern in your claims is becoming suspicious. Explain your own reasoning clearly.", "You are asking us to judge others while giving us reasons to question you."],
    Paranoid: ["Maybe you're pointing at everyone so nobody points at you.", "I think you're trying to control the vote, and I don't trust it.", "Every time you talk, someone else becomes the target. Convenient, isn't it?"],
    Aggressive: ["Stop directing traffic. You're looking guiltier every time you throw out a name.", "Maybe we should vote you instead. Your story is falling apart.", "You keep pushing people around like you own the vote. I don't buy it."],
    Quiet: ["I am starting to wonder why you keep steering suspicion away from yourself.", "Your accusations are becoming a pattern, and the pattern worries me.", "We have questioned everyone except the person making all these claims: you."],
    Charming: ["You make a persuasive show of accusing others, but perhaps we should look at you too.", "Let's not forget that the loudest guide can still lead us into a trap.", "Your confidence is charming, but it is not the same thing as innocence."],
    Observant: ["I noticed you change the subject whenever attention could return to you.", "Your words keep creating new suspects, yet you never examine your own contradictions.", "The timing of your accusations is making me suspicious of you."],
    Nervous: ["Why do you keep accusing everyone? Maybe you're the Mafia.", "I'm starting to think you're trying to confuse us on purpose.", "You make me nervous. Every name you mention becomes a fight."],
  };
  const reply = freshLine(bot, lines[bot.personality] || lines.Quiet);
  return subject ? `About ${subject.name}: ${reply}` : reply;
}

function openingLine(bot) {
  const suspect = suspectFor(bot);
  const name = suspect?.name || "someone here";
  const lines = {
    Logical: [`Let's be methodical. I want to hear from everyone before voting.`, `${name} has been unusually difficult to read. I'm watching them.`, `We need facts. Who changed their story since yesterday?`, `Before we vote, I want ${name} to explain their reasoning.`],
    Paranoid: [`I don't trust ${name}. Actually, I don't trust any of you.`, `That sounds exactly like something Mafia would say.`, `Why is everyone so calm? ${name} knows something.`, `Watch how ${name} reacts when the pressure starts.`],
    Aggressive: [`Enough talking. ${name} is hiding something—vote them out.`, `${name}, answer the question. Now.`, `Someone is lying, and I'm done being polite about it.`, `I want a clear answer from ${name}, not another excuse.`],
    Quiet: [`I've been listening. ${name}'s story feels off.`, `I am not certain, but we should look closely at ${name}.`, `${name} hasn't said enough for me to read them.`, `Something about ${name}'s timing bothered me.`],
    Charming: [`Friends, let's not panic. Though ${name} has me curious.`, `I believe most of you. ${name}, help us believe you too.`, `Let's give ${name} a fair chance to explain.`, `A calm discussion will tell us more than a rushed vote.`],
    Observant: [`I noticed ${name} avoided the last accusation.`, `${name}'s reaction was more revealing than their words.`, `${name} became quieter when suspicion moved their way.`, `I am watching whether ${name}'s story stays consistent.`],
    Nervous: [`I—I think it might be ${name}. Don't blame me if I'm wrong.`, `This is getting bad. Why is ${name} looking at me?`, `I keep changing my mind, but ${name} worries me.`, `Can ${name} please explain before we vote?`],
  };
  return freshLine(bot, lines[bot.personality] || lines.Quiet);
}

function evidenceQuestion(bot, target) {
  const name = target.name;
  const lines = {
    Logical: [`What evidence do you have against ${name}?`, `What exactly did ${name} say or do?`, `Can you point to a contradiction from ${name}?`],
    Paranoid: [`Maybe you're right about ${name}, but what made you suspect them?`, `Why ${name}? Did you notice something the rest of us missed?`, `I distrust ${name} too, but give us a reason.`],
    Aggressive: [`That's a serious accusation. What has ${name} done?`, `Give us something solid against ${name}.`, `Why ${name}? Say exactly what you're basing that on.`],
    Quiet: [`What made you choose ${name}?`, `Do you have evidence against ${name}?`, `Could you explain what felt wrong about ${name}?`],
    Charming: [`Let's hear the reasoning. Why do you suspect ${name}?`, `You may be onto something, but what points to ${name}?`, `Help us follow you—what did ${name} do?`],
    Observant: [`Which detail about ${name} caught your attention?`, `Did ${name} say something inconsistent?`, `What behavior from ${name} are you basing that on?`],
    Nervous: [`Wait—why ${name}? Do you have proof?`, `What did ${name} do? I don't want to vote blindly.`, `Are you sure about ${name}? What did you notice?`],
  };
  return freshLine(bot, lines[bot.personality] || lines.Quiet);
}

function accusedReply(bot, conversation) {
  const lines = conversation.hasEvidence
    ? [`I can explain that. You're reading my behavior the wrong way.`, `That isn't proof that I'm Mafia. Let me answer the accusation.`, `I understand why that looked suspicious, but your conclusion about me is wrong.`]
    : [`Why me? You haven't given the town any evidence.`, `You're accusing me without explaining what I did.`, `I am not Mafia. Tell me what made you suspect me.`];
  return freshLine(bot, lines);
}

function relevantReply(bot, conversation, responseIndex) {
  const { target, intent, hasEvidence, insult, isQuestion, text } = conversation;
  if (insult && (!target || target === bot)) return insultReply(bot, Boolean(target));
  if (insult && target !== bot) {
    return freshLine(bot, [
      `Insulting ${target.name} doesn't make your argument smarter. It makes you look desperate.`,
      `If your case against ${target.name} were strong, you wouldn't need childish insults.`,
      `Drop the trash talk and explain what ${target.name} actually did.`,
      `You're attacking ${target.name} personally because your reasoning is weak.`,
    ]);
  }
  if (!target) {
    const excerpt = text.length > 58 ? `${text.slice(0, 55)}...` : text;
    return freshLine(bot, isQuestion
      ? [`My first question is: what evidence supports that?`, `I can't answer that confidently without hearing everyone's reasoning.`, `I'm not certain yet. What have you noticed?`]
      : [`When you say “${excerpt}”, what makes you think that?`, `Can you connect that idea to someone's behavior?`, `That could matter. What evidence led you there?`]);
  }

  if (target === bot && intent === "accusation") return accusedReply(bot, conversation);
  if (target === bot && intent === "defense") {
    return freshLine(bot, [`At least someone isn't rushing to judge me.`, `Thank you, but the town should still judge me by the evidence.`, `I appreciate the support. I'll keep answering questions.`]);
  }
  if (target === bot) {
    return freshLine(bot, [`I know my own allegiance, but you'll have to judge my actions.`, `Ask me something specific and I'll answer it.`, `All I can do is explain my reasoning and let you decide.`]);
  }

  if (responseIndex >= 2 && ((bot.reads.You ?? 0) >= 1.25 || (intent === "accusation" && !hasEvidence))) {
    return playerSuspicionReply(bot, target);
  }

  if (intent === "defense") {
    const trustsTarget = target.suspicion < 1.5 || (bot.role === "Mafia" && target.role === "Mafia");
    return freshLine(bot, trustsTarget
      ? [`I agree that we shouldn't rush to condemn ${target.name}.`, `${target.name} hasn't given me enough reason to vote for them yet.`, `Keeping an open mind about ${target.name} makes sense.`]
      : [`I'm not ready to clear ${target.name}. What makes you trust them?`, `${target.name} still has questions to answer before I call them innocent.`, `Your defense of ${target.name} needs evidence too.`]);
  }

  if (intent === "mention") {
    const isConcerned = target.suspicion >= 1.45 || (bot.role === "Mafia" && target.role !== "Mafia");
    return freshLine(bot, isConcerned
      ? [`I have some doubts about ${target.name}, but nothing conclusive yet.`, `${target.name} is worth watching. I want to hear more from them.`, `My read on ${target.name} is uncertain, though their behavior concerns me.`]
      : [`I don't have a strong reason to suspect ${target.name} yet.`, `${target.name} isn't my main concern right now, but I'm listening.`, `I need to hear more from ${target.name} before judging them.`]);
  }

  // A direct accusation without a reason always stays on that person.
  // The first bot asks for evidence; later bots react to the same claim.
  if (!hasEvidence && responseIndex === 0) return evidenceQuestion(bot, target);

  const priorClaims = state.claims.filter((claim) => claim.target === target).length;
  if (!hasEvidence && priorClaims > 1) {
    return freshLine(bot, [`You've suspected ${target.name} before, but we still need a concrete reason.`, `Repeating ${target.name}'s name doesn't make the case stronger. What is the evidence?`, `This isn't the first accusation against ${target.name}. We need facts now.`]);
  }

  const protectsPartner = bot.role === "Mafia" && target.role === "Mafia";
  const leansGuilty = !protectsPartner && (target.suspicion >= 1.45 || (bot.role === "Mafia" && target.role !== "Mafia"));

  if (protectsPartner) {
    return freshLine(bot, [`I don't see a case against ${target.name} yet. We need more than suspicion.`, `${target.name} deserves a chance to answer before we pile on.`, `Focusing on ${target.name} this quickly could be a mistake.`]);
  }
  if (hasEvidence && leansGuilty) {
    return freshLine(bot, [`That is a concrete reason to question ${target.name}. They should answer it.`, `I noticed something similar about ${target.name}. Your argument is worth checking.`, `Your evidence against ${target.name} makes more sense than a blind accusation.`]);
  }
  if (leansGuilty) {
    return freshLine(bot, [`I have doubts about ${target.name} too, but I want evidence before voting.`, `${target.name} has seemed suspicious to me as well.`, `I can see why you chose ${target.name}, though I'm not fully convinced.`]);
  }
  return freshLine(bot, [`I'm not convinced that ${target.name} is Mafia yet.`, `${target.name} isn't my strongest suspect. What else points to them?`, `I need more before I vote for ${target.name}.`]);
}

async function botDiscussion(context = "opening", humanText = "") {
  const bots = alivePeople().filter((p) => !p.human);
  const conversation = context === "reply" ? understandMessage(humanText) : null;
  let orderedBots = shuffle(bots);
  if (conversation?.target?.alive && !conversation.target.human) {
    const others = orderedBots.filter((bot) => bot !== conversation.target);
    const namedBot = orderedBots.filter((bot) => bot === conversation.target);
    // Without evidence, another player challenges the claim before the accused answers.
    // With evidence, the named bot answers first and the town then evaluates it.
    orderedBots = conversation.hasEvidence || conversation.insult
      ? [...namedBot, ...others]
      : [others[0], ...namedBot, ...others.slice(1)].filter(Boolean);
  }
  const responseCount = context === "reply" ? Math.min(3, orderedBots.length) : Math.min(state.players >= 12 ? 4 : 3, orderedBots.length);
  const speakers = orderedBots.slice(0, responseCount);
  for (const [index, bot] of speakers.entries()) {
    await wait(450 + Math.random() * 500);
    if (state.phase !== "day") return;
    addMessage(bot, context === "reply" ? relevantReply(bot, conversation, index) : openingLine(bot));
  }
}

async function setDay() {
  state.phase = "day";
  $("#roundLabel").textContent = `DAY ${state.round}`;
  $("#phaseTitle").textContent = "The town wakes";
  $("#phaseIcon").textContent = "☀";
  $("#bannerTitle").textContent = "Discuss and find the Mafia";
  $("#bannerText").textContent = "Write anything. The bots will answer in character.";
  $("#chatForm").classList.toggle("hidden", !state.human.alive);
  $("#votePanel").classList.toggle("hidden", !state.human.alive);
  $("#voteChoices").classList.add("hidden");
  renderRoster();
  await botDiscussion("opening");
  if (!state.human.alive && state.phase === "day") {
    addMessage(null, "You are out of the game. The surviving bots will finish the vote.", true);
    await wait(900);
    resolveVote(null);
  }
}

function renderActions(title, targets, callback) {
  $("#votePanel").classList.add("hidden");
  $("#chatForm").classList.add("hidden");
  $("#voteChoices").classList.remove("hidden");
  $("#voteChoices .section-label").textContent = title;
  $("#voteButtons").innerHTML = "";
  targets.forEach((target) => {
    const button = document.createElement("button");
    button.className = "action-choice";
    button.type = "button";
    button.textContent = target.name;
    button.addEventListener("click", () => callback(target), { once: true });
    $("#voteButtons").appendChild(button);
  });
}

function beginNight() {
  if (checkWinner()) return;
  state.phase = "night";
  $("#roundLabel").textContent = `NIGHT ${state.round}`;
  $("#phaseTitle").textContent = "Night falls";
  $("#phaseIcon").textContent = "☾";
  $("#bannerTitle").textContent = "The town closes its eyes";
  $("#bannerText").textContent = state.human.alive ? "Your night action is private." : "You are out, but you may watch the night pass.";
  $("#chatForm").classList.add("hidden");
  $("#votePanel").classList.add("hidden");
  addMessage(null, `Night ${state.round} begins.`, true);

  if (!state.human.alive || state.human.role === "Civilian") {
    $("#voteChoices").classList.add("hidden");
    setTimeout(() => resolveNight(null), 900);
  } else if (state.human.role === "Mafia") {
    renderActions("CHOOSE A TARGET", alivePeople(state.human).filter((p) => p.role !== "Mafia"), (target) => resolveNight({ type: "kill", target }));
  } else if (state.human.role === "Doctor") {
    renderActions("CHOOSE WHO TO PROTECT", state.people.filter((p) => p.alive), (target) => resolveNight({ type: "save", target }));
  } else {
    renderActions("CHOOSE WHO TO INVESTIGATE", alivePeople(state.human), (target) => resolveNight({ type: "inspect", target }));
  }
}

async function resolveNight(humanAction) {
  $("#voteChoices").classList.add("hidden");
  const mafia = state.people.filter((p) => p.alive && p.role === "Mafia");
  const townTargets = state.people.filter((p) => p.alive && p.role !== "Mafia");
  let victim = humanAction?.type === "kill" ? humanAction.target : randomFrom(townTargets);
  const doctor = state.people.find((p) => p.alive && p.role === "Doctor");
  let saved = humanAction?.type === "save" ? humanAction.target : doctor ? randomFrom(state.people.filter((p) => p.alive)) : null;
  if (!mafia.length) victim = null;

  if (humanAction?.type === "inspect") {
    state.investigation = humanAction.target;
    addMessage(null, `${humanAction.target.name} is ${humanAction.target.role === "Mafia" ? "MAFIA" : "NOT Mafia"}. Only you know this.`, true);
    await wait(1000);
  }
  await wait(700);
  state.round += 1;
  if (victim && victim !== saved) {
    victim.alive = false;
    addMessage(null, `Dawn breaks. ${victim.name} was taken in the night. Their role remains secret.`, true);
  } else {
    addMessage(null, "Dawn breaks. No one died during the night.", true);
  }
  if (!checkWinner()) setDay();
}

function callVote() {
  renderActions("CAST YOUR VOTE", alivePeople(state.human), resolveVote);
}

async function resolveVote(humanTarget) {
  $("#voteChoices").classList.add("hidden");
  const votes = new Map(state.people.filter((p) => p.alive).map((p) => [p, 0]));
  if (humanTarget && state.human.alive) votes.set(humanTarget, (votes.get(humanTarget) || 0) + 1);
  for (const bot of state.people.filter((p) => p.alive && !p.human)) {
    let target = suspectFor(bot);
    if (bot.role === "Mafia" && target.role === "Mafia") target = randomFrom(alivePeople(bot).filter((p) => p.role !== "Mafia"));
    votes.set(target, (votes.get(target) || 0) + 1);
  }
  const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1]);
  const eliminated = ranked[0][0];
  eliminated.alive = false;
  const summary = ranked.filter(([, count]) => count).map(([p, count]) => `${p.name} ${count}`).join(" · ");
  addMessage(null, `Votes: ${summary}. ${eliminated.name} is removed from town. They were ${eliminated.role}.`, true);
  renderRoster();
  await wait(1200);
  if (!checkWinner()) beginNight();
}

function checkWinner() {
  const alive = state.people.filter((p) => p.alive);
  const mafia = alive.filter((p) => p.role === "Mafia").length;
  const town = alive.length - mafia;
  if (mafia > 0 && mafia < town) return false;
  const mafiaWon = mafia > 0;
  $("#endIcon").textContent = mafiaWon ? "♠" : "☀";
  $("#endTitle").textContent = mafiaWon ? "The Mafia wins." : "The town survives.";
  $("#endText").textContent = mafiaWon ? "The Mafia now controls the vote. Trust ran out before time did." : "Every member of the Mafia has been found.";
  $("#roleReveal").innerHTML = state.people.map((p) => `<span>${p.name}: ${p.role}</span>`).join("");
  showScreen(endScreen);
  return true;
}

document.addEventListener("click", (event) => {
  const action = event.target.dataset.action;
  if (action === "players-down") state.players = clamp(state.players - 1, 4, 18);
  if (action === "players-up") state.players = clamp(state.players + 1, 4, 18);
  if (action === "mafia-down") state.mafia = clamp(state.mafia - 1, 1, 4);
  if (action === "mafia-up") state.mafia += 1;
  if (action) updateSetup();
});

[$("#detectiveToggle"), $("#doctorToggle")].forEach((toggle) => toggle.addEventListener("change", updateSetup));
$("#dealButton").addEventListener("click", () => {
  createGame();
  roleCard.classList.remove("is-revealed");
  $("#tapHint").classList.remove("hidden");
  $("#nextButton").classList.add("hidden");
  showScreen(dealScreen);
});
roleCard.addEventListener("click", revealHumanRole);
$("#nextButton").addEventListener("click", () => {
  const role = roles[state.human.role];
  $("#identityIcon").textContent = role.icon;
  $("#identityRole").textContent = state.human.role;
  $("#identityIcon").style.color = role.color;
  $("#chatLog").innerHTML = "";
  showScreen(gameScreen);
  renderRoster();
  addMessage(null, "Everyone has received a private role. The first day begins.", true);
  setDay();
});

$("#chatForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = $("#chatInput");
  const text = input.value.trim();
  if (!text || state.phase !== "day" || !state.human.alive || state.replying) return;
  addMessage(state.human, text);
  input.value = "";
  state.messages += 1;
  const conversation = understandMessage(text);
  evaluatePlayerStatement(conversation);
  if (conversation.target && conversation.intent === "accusation") {
    conversation.target.suspicion += conversation.hasEvidence ? 1.1 : 0.45;
    state.claims.push({ target: conversation.target, intent: "accusation", evidence: conversation.hasEvidence, round: state.round });
  } else if (conversation.target && conversation.intent === "defense") {
    conversation.target.suspicion = Math.max(0, conversation.target.suspicion - 0.35);
    state.claims.push({ target: conversation.target, intent: "defense", evidence: conversation.hasEvidence, round: state.round });
  }
  state.replying = true;
  input.disabled = true;
  try {
    await botDiscussion("reply", text);
  } finally {
    state.replying = false;
    input.disabled = false;
    if (state.phase === "day" && state.human.alive) input.focus();
  }
});

$("#openVoteButton").addEventListener("click", callVote);
$("#backSetupButton").addEventListener("click", () => showScreen(setupScreen));
$("#endSetupButton").addEventListener("click", () => showScreen(setupScreen));
$("#newRoundButton").addEventListener("click", () => {
  createGame();
  roleCard.classList.remove("is-revealed");
  $("#tapHint").classList.remove("hidden");
  $("#nextButton").classList.add("hidden");
  showScreen(dealScreen);
});

const modal = $("#rulesModal");
$("#rulesButton").addEventListener("click", () => modal.classList.remove("hidden"));
$("#closeRules").addEventListener("click", () => modal.classList.add("hidden"));
modal.addEventListener("click", (event) => { if (event.target === modal) modal.classList.add("hidden"); });
document.addEventListener("keydown", (event) => { if (event.key === "Escape") modal.classList.add("hidden"); });

updateSetup();
