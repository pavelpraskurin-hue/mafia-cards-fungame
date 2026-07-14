const state = {
  players: 4,
  mafia: 1,
  people: [],
  human: null,
  round: 1,
  phase: "setup",
  investigation: null,
  messages: 0,
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
];

const $ = (selector) => document.querySelector(selector);
const setupScreen = $("#setupScreen");
const dealScreen = $("#dealScreen");
const gameScreen = $("#gameScreen");
const endScreen = $("#endScreen");
const roleCard = $("#roleCard");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function recommendedMafia(players) { return players >= 7 ? 2 : 1; }

function updateSetup() {
  const specials = Number($("#detectiveToggle").checked) + Number($("#doctorToggle").checked);
  const maximumMafia = Math.max(1, Math.min(2, Math.floor((state.players - 1) / 2), state.players - specials - 1));
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
    .map((person, index) => ({ ...person, role: deck[index], alive: true, suspicion: Math.random() * 2 }));
  state.human = state.people[0];
  state.round = 1;
  state.messages = 0;
  state.investigation = null;
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

function suspectFor(bot) {
  const candidates = alivePeople(bot);
  if (bot.role === "Mafia") return randomFrom(candidates.filter((p) => p.role !== "Mafia") || candidates);
  return [...candidates].sort((a, b) => b.suspicion - a.suspicion)[0];
}

function botLine(bot, context = "opening") {
  const suspect = suspectFor(bot);
  const name = suspect?.name || "someone here";
  const lines = {
    Logical: context === "reply"
      ? [`That claim needs evidence. What exactly did ${name} do?`, `We should track contradictions, not volume. ${name}, explain your reasoning.`, `Statistically, a rushed accusation helps the Mafia.`]
      : [`Let's be methodical. I want to hear from everyone before voting.`, `${name} has been unusually difficult to read. I'm watching them.`, `We need facts. Who changed their story since yesterday?`],
    Paranoid: [`I don't trust ${name}. Actually, I don't trust any of you.`, `That sounds exactly like something Mafia would say.`, `Why is everyone so calm? ${name} knows something.`],
    Aggressive: [`Enough talking. ${name} is hiding something—vote them out.`, `${name}, answer the question. Now.`, `Someone is lying, and I'm done being polite about it.`],
    Quiet: [`I've been listening. ${name}'s story feels off.`, `I am not certain, but we should look closely at ${name}.`],
    Charming: [`Friends, let's not panic. Though ${name} has me curious.`, `I believe most of you. ${name}, help us believe you too.`],
    Observant: [`I noticed ${name} avoided the last accusation.`, `${name}'s reaction was more revealing than their words.`],
    Nervous: [`I—I think it might be ${name}. Don't blame me if I'm wrong.`, `This is getting bad. Why is ${name} looking at me?`],
  };
  return randomFrom(lines[bot.personality] || lines.Quiet);
}

async function botDiscussion(context = "opening") {
  const bots = alivePeople().filter((p) => !p.human);
  const speakers = shuffle(bots).slice(0, Math.min(3, bots.length));
  for (const bot of speakers) {
    await wait(450 + Math.random() * 500);
    addMessage(bot, botLine(bot, context));
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
  if (action === "players-down") state.players = clamp(state.players - 1, 4, 8);
  if (action === "players-up") state.players = clamp(state.players + 1, 4, 8);
  if (action === "mafia-down") state.mafia = clamp(state.mafia - 1, 1, 2);
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
  if (!text || state.phase !== "day" || !state.human.alive) return;
  addMessage(state.human, text);
  input.value = "";
  state.messages += 1;
  const lower = text.toLowerCase();
  state.people.filter((p) => !p.human && lower.includes(p.name.toLowerCase())).forEach((p) => { p.suspicion += 1.5; });
  await botDiscussion("reply");
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
