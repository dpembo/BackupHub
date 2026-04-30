/**
 * Rounds a number to a specified number of decimal places.
 *
 * @param {number} number - The number to be rounded.
 * @param {number} decimalPlaces - The number of decimal places to round to.
 * @returns {number} The rounded number.
 */
function roundToDecimalPlaces(number, decimalPlaces) {
    const factor = Math.pow(10, decimalPlaces);
    return Math.round(number * factor) / factor;
}

/**
 * Rounds a number to the nearest integer.
 *
 * @param {number} number - The number to be rounded.
 * @returns {number} The rounded integer.
 */
function roundToNearestInteger(number) {
    const roundedNumber = Math.round(number);
    return roundedNumber;
}

/**
 * Rounds a number down to the nearest integer.
 *
 * @param {number} number - The number to be rounded down.
 * @returns {number} The rounded down integer.
 */
function roundDown(number) {
    const roundedNumber = Math.floor(number);
    return roundedNumber;
}

/**
 * Rounds a number up to the nearest integer.
 *
 * @param {number} number - The number to be rounded up.
 * @returns {number} The rounded up integer.
 */
function roundUp(number) {
    const roundedNumber = Math.ceil(number);
    return roundedNumber;
}

/**
 * Rounds a number to a specified number of significant digits.
 *
 * @param {number} number - The number to be rounded.
 * @param {number} significantDigits - The number of significant digits to round to.
 * @returns {number} The rounded number.
 */
function roundToSignificantDigits(number, significantDigits) {
    const multiplier = Math.pow(10, significantDigits - Math.floor(Math.log10(Math.abs(number))) - 1);
    return Math.round(number * multiplier) / multiplier;
}

module.exports = { roundToDecimalPlaces, roundToNearestInteger, roundUp, roundDown, roundToSignificantDigits }
