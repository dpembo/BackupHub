function roundToDecimalPlaces(number, decimalPlaces) {
    const factor = Math.pow(10, decimalPlaces);
    return Math.round(number * factor) / factor;
}

function roundToNearestInteger(number) {
    const roundedNumber = Math.round(number);
    return roundedNumber;
}

function roundDown(number) {
    const roundedNumber = Math.floor(number);
    return roundedNumber;
}

function roundUp(number) {
    const roundedNumber = Math.ceil(number);
    return roundedNumber;
}

function roundToSignificantDigits(number, significantDigits) {
  const multiplier = Math.pow(10, significantDigits - Math.floor(Math.log10(Math.abs(number))) - 1);
  return Math.round(number * multiplier) / multiplier;
}

module.exports = { roundToDecimalPlaces, roundToNearestInteger, roundUp, roundDown, roundToSignificantDigits }
