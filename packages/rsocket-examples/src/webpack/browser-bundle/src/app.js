let state = "CONNECTING";
let outputDiv = document.querySelector("#output");
let _rsocket = null;
let errorColor = "#eb4034";
let infoColor = "#348CEBFF";
let messageColor = "#2ccd20";

function sendMessage(message) {
  if (state !== "CONNECTED") {
    const div = document.createElement("div");
    div.textContent = `[${new Date().toISOString()}] not connected. cannot send messages!`;
    div.style.color = errorColor;
    outputDiv.appendChild(div);
    return;
  }
  const bufferData = rsocket.createBuffer(message || "");
  _rsocket.requestResponse(
    {
      data: bufferData,
    },
    {
      onError: function (e) {
        console.error(e);
      },
      onNext: function (payload, isComplete) {
        const div = document.createElement("div");
        div.textContent = `[${new Date().toISOString()}] received: payload[data: ${
          payload.data
        }; metadata: ${payload.metadata}]|${isComplete}`;
        div.style.color = messageColor;
        outputDiv.appendChild(div);
      },
      onComplete: function () {
        const div = document.createElement("div");
        div.textContent = `Stream completed...`;
        outputDiv.appendChild(div);
      },
      onExtension: function () {},
    }
  );
}

let sendButton = document.querySelector("#send-button");
sendButton.addEventListener("click", function () {
  let input = document.querySelector("#input-field");
  let value = input.value;
  if (!value.length) {
    const div = document.createElement("div");
    div.textContent = `[${new Date().toISOString()}] please include a message!`;
    div.style.color = errorColor;
    outputDiv.appendChild(div);
    return;
  }
  const div = document.createElement("div");
  div.textContent = `[${new Date().toISOString()}] sending: ${value}`;
  div.style.color = infoColor;
  outputDiv.appendChild(div);
  sendMessage(value);
});

rsocket
  .connect({
    url: "ws://localhost:9090",
  })
  .then(function (_r) {
    state = "CONNECTED";
    _rsocket = _r;
    const div = document.createElement("div");
    div.textContent = `[${new Date().toISOString()}] connected!`;
    div.style.color = infoColor;
    outputDiv.appendChild(div);
  })
  .catch(function (err) {
    const errorMessage =
      err?.message ||
      "failed to connect to rsocket! check the console for more details.";
    if (err) {
      console.error("failed to connect rsocket: " + err.message);
    } else {
      console.error("failed to connect rsocket!");
    }
    const div = document.createElement("div");
    div.textContent = `[${new Date().toISOString()}] ${errorMessage}`;
    div.style.color = errorColor;
    outputDiv.appendChild(div);
  });
