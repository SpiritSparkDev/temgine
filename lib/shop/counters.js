/**
 * Atomar hochzählender Zähler (z. B. Rechnungsnummern je Jahr: key "invoice-2026").
 * `client` ist prisma oder ein Transaktions-Client; die Zahl ist innerhalb der Transaktion eindeutig.
 * @returns {Promise<number>} der neue Wert (beginnt bei 1)
 */
export async function nextCounter(client, key) {
  const row = await client.shopCounter.upsert({
    where: { key },
    update: { value: { increment: 1 } },
    create: { key, value: 1 },
  })
  return row.value
}
