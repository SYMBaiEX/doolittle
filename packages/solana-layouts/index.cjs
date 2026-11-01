const { Layout, blob, u8 } = require("@solana/buffer-layout");
const { PublicKey } = require("@solana/web3.js");
const BigNumber = require("bignumber.js");
const {
  bytesToNumberBE,
  bytesToNumberLE,
  numberToBytesBE,
  numberToBytesLE,
} = require("noble-layout-codecs/utils.js");

/** @template T @param {import('@solana/buffer-layout').Layout<T>} layout */
function encodeDecode(layout) {
  return {
    encode: layout.encode.bind(layout),
    decode: layout.decode.bind(layout),
  };
}

/** @template T,U @extends {Layout<T>} */
class CodecLayout extends Layout {
  /**
   * @param {import('@solana/buffer-layout').Layout<U>} layout
   * @param {(value: U) => T} from
   * @param {(value: T) => U} to
   */
  constructor(layout, from, to) {
    super(layout.span, layout.property);
    this.layout = layout;
    this.from = from;
    this.to = to;
  }
  /** @param {Uint8Array} bytes @param {number} [offset] */
  decode(bytes, offset = 0) {
    return this.from(this.layout.decode(bytes, offset));
  }
  /** @param {T} value @param {Uint8Array} bytes @param {number} [offset] */
  encode(value, bytes, offset = 0) {
    return this.layout.encode(this.to(value), bytes, offset);
  }
}

/** @param {number} length @param {boolean} littleEndian */
function unsigned(length, littleEndian) {
  if (!Number.isSafeInteger(length) || length < 0)
    throw new RangeError("Invalid unsigned layout width");
  /** @param {string} [property] */
  return (property) =>
    new CodecLayout(
      blob(length, property),
      (bytes) =>
        length === 0
          ? 0n
          : littleEndian
            ? bytesToNumberLE(bytes)
            : bytesToNumberBE(bytes),
      /** @param {bigint} value */
      (value) => {
        if (typeof value !== "bigint") throw new TypeError("Expected a BigInt");
        if (length === 0) {
          if (value !== 0n)
            throw new RangeError("Unsigned value does not fit an empty layout");
          return new Uint8Array();
        }
        // Convert and validate before touching the caller's destination buffer.
        return littleEndian
          ? numberToBytesLE(value, length)
          : numberToBytesBE(value, length);
      },
    );
}

/** @param {number} length */
const bigInt = (length) => unsigned(length, true);
/** @param {number} length */
const bigIntBE = (length) => unsigned(length, false);
const u128 = bigInt(16);
const WAD = new BigNumber("1e18");

exports.encodeDecode = encodeDecode;
exports.bigInt = bigInt;
exports.bigIntBE = bigIntBE;
exports.u64 = bigInt(8);
exports.u64be = bigIntBE(8);
exports.u128 = u128;
exports.u128be = bigIntBE(16);
exports.u192 = bigInt(24);
exports.u192be = bigIntBE(24);
exports.u256 = bigInt(32);
exports.u256be = bigIntBE(32);
exports.WAD = WAD;
/** @param {string} [property] */
exports.decimal = (property) =>
  new CodecLayout(
    u128(property),
    (value) => new BigNumber(value.toString()).div(WAD),
    /** @param {InstanceType<typeof BigNumber>} value */
    (value) => BigInt(value.times(WAD).integerValue().toFixed()),
  );
/** @param {string} [property] */
exports.bool = (property) => new CodecLayout(u8(property), Boolean, Number);
/** @param {string} [property] */
exports.publicKey = (property) =>
  new CodecLayout(
    blob(32, property),
    (bytes) => new PublicKey(bytes),
    /** @param {import('@solana/web3.js').PublicKey} value */
    (value) => value.toBytes(),
  );
