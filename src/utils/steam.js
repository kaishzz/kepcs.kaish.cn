function isValidSteamId64(value) {
  return /^7656119\d{10}$/.test(String(value));
}

module.exports = {
  isValidSteamId64,
};