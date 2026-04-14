function getByPath(source, path) {
  if (!source || !path) {
    return undefined;
  }

  return path
    .split(".")
    .reduce((current, segment) => (current == null ? undefined : current[segment]), source);
}

function pickFirstDefined(source, paths) {
  for (const path of paths) {
    const value = getByPath(source, path);

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return undefined;
}

module.exports = {
  pickFirstDefined,
};
