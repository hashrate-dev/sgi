/** Pools por defecto (sobrescribibles con `KRYPTEX_POOLS_JSON` en el servidor). */
export const DEFAULT_KRYPTEX_POOL_CONFIGS: Array<{
  url: string;
  workers: string[];
  usuario: string;
  modelo: string;
}> = [
  {
    url: "https://pool.kryptex.com/quai-sha256/miner/stats/0x006942Fa7a650523A80044d9A7fDBac7f093929F",
    workers: ["HashR2L4P3", "HashR2L6P8", "HashR2L4P4"],
    usuario: "Mariri",
    modelo: "S21 - 200 ths",
  },
  {
    url: "https://pool.kryptex.com/quai-scrypt/miner/stats/0x00213cd13935074E78a34FBFa9cf432398a0e15D",
    workers: ["HashR2L11P2"],
    usuario: "Chivilcoy",
    modelo: "L7",
  },
  {
    url: "https://pool.kryptex.com/quai-scrypt/miner/stats/0x006942Fa7a650523A80044d9A7fDBac7f093929F",
    workers: ["HashR2L2P4", "HashR2L10P2", "HashR2L4P2", "HashR2L9P4"],
    usuario: "Mariri",
    modelo: "L7",
  },
  {
    url: "https://pool.kryptex.com/quai-scrypt/miner/stats/0x0062E304D5d3B145326C69127f78FC68739c9c35",
    workers: ["HashR1L1P4"],
    usuario: "Cryptobros",
    modelo: "L7",
  },
  {
    url: "https://pool.kryptex.com/quai-scrypt/miner/stats/0x000F983A501b754ebB500Fbca0C98b21D6F1C5f2",
    workers: ["HashR2L1P3", "HashR2L9P3", "HashR2L1P1", "HashR2L11P7"],
    usuario: "Hashrate",
    modelo: "L7",
  },
  {
    url: "https://pool.kryptex.com/quai-scrypt/miner/stats/0x002D5872Ce22a3D66fEC2f798fC75ca5c165Cb77",
    workers: ["HashR2L9P6", "HashR2L10P7", "HashR2L9P2", "HashR2L10P6", "HashR1L1P7", "HashR2L10P4"],
    usuario: "Pirotto",
    modelo: "L7",
  },
  {
    url: "https://pool.kryptex.com/quai-scrypt/miner/stats/0x001F760a31e623B27381B99ef278DC209AAAf98E",
    workers: ["HashR1L1P2"],
    usuario: "Valkyria",
    modelo: "L7",
  },
  {
    url: "https://pool.kryptex.com/quai-scrypt/miner/stats/0x0050fc078B89fbe0a59956187B30B4FdF8F261e9",
    workers: ["HashR2L10P5", "HashR2L11P8"],
    usuario: "Damasco",
    modelo: "L7",
  },
  {
    url: "https://pool.kryptex.com/quai-scrypt/miner/stats/0x005Eb53eD5242eCed3A10BD92D2B81CA1dE8F4D5",
    workers: ["HashR2L10P3"],
    usuario: "Bala",
    modelo: "L7",
  },
  {
    url: "https://pool.kryptex.com/quai-scrypt/miner/stats/0x0049bad765B6c41dFFBF48526B5e970404E9D5Ff",
    workers: ["HashR2L1P8", "HashR2L9P8", "HashR2L1P2"],
    usuario: "Jlsoler",
    modelo: "L7",
  },
];
