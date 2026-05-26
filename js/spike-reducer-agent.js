(function () {
  "use strict";

  const cfg = window.SPIKE_REDUCER_CONFIG || {};
  const GREETING =
    cfg.greeting || "Hey, I am your spike reducer. Tell me about your next meal.";

  const openBtn = document.getElementById("spikeReducerOpenBtn");
  const modal = document.getElementById("spikeReducerModal");
  const backdrop = document.getElementById("spikeReducerBackdrop");
  const closeBtn = document.getElementById("spikeReducerCloseBtn");
  const statusEl = document.getElementById("srStatus");
  const greetingEl = document.getElementById("srGreeting");
  const textInput = document.getElementById("srTextInput");
  const listenBtn = document.getElementById("srListenBtn");
  const sendBtn = document.getElementById("srSendBtn");
  const stopBtn = document.getElementById("srStopBtn");
  const transcriptEl = document.getElementById("srTranscript");
  const responseEl = document.getElementById("srResponse");

  if (!openBtn || !modal) return;

  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let history = [];
  let busy = false;

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg;
  }

  function setGreeting(text) {
    if (greetingEl) greetingEl.textContent = text;
  }

  function showModal() {
    modal.hidden = false;
    if (backdrop) backdrop.hidden = false;
    document.body.style.overflow = "hidden";
    openBtn.setAttribute("aria-expanded", "true");
  }

  function hideModal() {
    stopAll();
    modal.hidden = true;
    if (backdrop) backdrop.hidden = true;
    document.body.style.overflow = "";
    openBtn.setAttribute("aria-expanded", "false");
  }

  function stopAll() {
    window.speechSynthesis.cancel();
    if (recognition) {
      try {
        recognition.abort();
      } catch (_) {}
    }
    busy = false;
  }

  function speak(text, onEnd) {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 1;
    const voices = window.speechSynthesis.getVoices();
    const en = voices.find(function (v) {
      return v.lang.startsWith("en");
    });
    if (en) u.voice = en;
    if (onEnd) {
      u.onend = onEnd;
      u.onerror = onEnd;
    }
    window.speechSynthesis.speak(u);
  }

  function speakReply(text) {
    const short =
      text.length > 500 ? text.slice(0, 480).replace(/\s+\S*$/, "") + "…" : text;
    speak(short);
  }

  function initRecognition() {
    if (!SpeechRecognition) return null;
    const r = new SpeechRecognition();
    r.lang = "en-US";
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.continuous = false;
    return r;
  }

  function startListening() {
    if (!SpeechRecognition) {
      setStatus("Voice not supported here — type your meal and press Send.");
      if (textInput) textInput.focus();
      return;
    }
    stopAll();
    recognition = initRecognition();
    setStatus("Listening… describe your next meal.");
    recognition.onresult = function (ev) {
      const text = ev.results[0][0].transcript.trim();
      if (textInput) textInput.value = text;
      if (transcriptEl) transcriptEl.textContent = "You said: " + text;
      setStatus("Got it — sending to Spike Reducer…");
      submitMessage(text);
    };
    recognition.onerror = function (ev) {
      setStatus(
        "Could not hear you (" + (ev.error || "error") + "). Try typing instead."
      );
      busy = false;
    };
    recognition.onend = function () {
      if (!busy) setStatus("Tap the mic or Send when ready.");
    };
    busy = true;
    recognition.start();
  }

  async function submitMessage(message) {
    const apiUrl = (cfg.apiUrl || "").trim();
    if (!apiUrl) {
      setStatus("API not configured yet.");
      if (responseEl) {
        responseEl.textContent =
          "Spike Reducer needs your free Cloudflare Worker URL.\n\n" +
          "1. Get a free Gemini API key: https://aistudio.google.com/apikey\n" +
          "2. Install Wrangler: npm install -g wrangler\n" +
          "3. In this project folder run:\n" +
          "   wrangler login\n" +
          "   wrangler secret put GEMINI_API_KEY\n" +
          "   wrangler deploy\n" +
          "4. Copy the Worker URL + /api/spike-reducer into js/spike-reducer-config.js (apiUrl)\n\n" +
          "Full steps: README-spike-reducer.md";
      }
      busy = false;
      return;
    }

    if (!message) {
      setStatus("Please describe your meal first.");
      busy = false;
      return;
    }

    stopAll();
    busy = true;
    setStatus("Thinking…");
    if (responseEl) responseEl.textContent = "";

    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message, history: history }),
      });
      const data = await res.json().catch(function () {
        return {};
      });

      if (!res.ok) {
        throw new Error(data.message || data.error || "Request failed");
      }

      const reply = data.reply || "";
      history.push({ role: "user", text: message });
      history.push({ role: "assistant", text: reply });
      if (history.length > 12) history = history.slice(-12);

      if (responseEl) responseEl.textContent = reply;
      setStatus("Here is your guidance.");
      speakReply(reply);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setStatus("Error");
      if (responseEl) {
        responseEl.textContent =
          "Could not reach Spike Reducer. Check your Worker URL and API key.\n\n" +
          msg;
      }
    } finally {
      busy = false;
    }
  }

  function onOpen() {
    showModal();
    history = [];
    if (transcriptEl) transcriptEl.textContent = "";
    if (responseEl) responseEl.textContent = "";
    if (textInput) textInput.value = "";
    setGreeting(GREETING);
    setStatus("Speaking…");
    speak(GREETING, function () {
      setStatus("Tap the mic or type your meal, then Send.");
      if (SpeechRecognition) startListening();
      else if (textInput) textInput.focus();
    });
  }

  openBtn.addEventListener("click", function (e) {
    e.preventDefault();
    onOpen();
  });

  if (closeBtn) closeBtn.addEventListener("click", hideModal);
  if (backdrop) backdrop.addEventListener("click", hideModal);

  if (listenBtn) {
    listenBtn.addEventListener("click", function () {
      if (!busy) startListening();
    });
  }

  if (sendBtn) {
    sendBtn.addEventListener("click", function () {
      const text = textInput ? textInput.value.trim() : "";
      if (transcriptEl && text) transcriptEl.textContent = "You said: " + text;
      submitMessage(text);
    });
  }

  if (stopBtn) {
    stopBtn.addEventListener("click", function () {
      stopAll();
      setStatus("Stopped. Tap mic or Send to continue.");
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && modal && !modal.hidden) hideModal();
  });

  if (window.speechSynthesis) {
    window.speechSynthesis.getVoices();
  }
})();
