function formatFenToYuan(amountFen) {
  return (amountFen / 100).toFixed(2);
}

function parseYuanToFen(amount) {
  if (amount == null || amount === "") {
    return null;
  }

  const normalized = Number.parseFloat(String(amount));

  if (!Number.isFinite(normalized)) {
    return null;
  }

  return Math.round(normalized * 100);
}

module.exports = {
  formatFenToYuan,
  parseYuanToFen,
};