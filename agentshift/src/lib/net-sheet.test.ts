import { describe, it, expect } from 'vitest'
import { sellerNetSheet, buyerCashToClose, monthlyPayment } from './net-sheet'

describe('sellerNetSheet', () => {
  const base = {
    salePrice: 650_000,
    listingSideRate: 0.025,
    buyerBrokerRate: 0.025,
    titlePolicy: 2_100,
    escrowFee: 900,
    transferTaxRate: 0.0011,
    recordingFees: 145,
    mortgagePayoff: 310_000,
    payoffRate: 0.0325,
    payoffDays: 12,
  }

  it('nets sale price less every line item', () => {
    const r = sellerNetSheet(base)
    const totalOut = r.lines.reduce((s, l) => s + l.amount, 0)
    expect(r.netProceeds).toBeCloseTo(650_000 - totalOut, 2)
  })

  it('keeps the two commission sides as separate negotiated lines', () => {
    const r = sellerNetSheet(base)
    const listing = r.lines.find(l => l.label === 'Listing brokerage fee')!
    const buyer = r.lines.find(l => l.label === 'Buyer broker compensation')!
    expect(listing.amount).toBe(16_250)
    expect(buyer.amount).toBe(16_250)
    expect(buyer.note).toMatch(/not via MLS/)
    expect(r.totalCommission).toBe(32_500)
  })

  it('handles a seller paying nothing to the buyer broker', () => {
    const r = sellerNetSheet({ ...base, buyerBrokerRate: 0 })
    expect(r.lines.some(l => l.label === 'Buyer broker compensation')).toBe(false)
    expect(r.totalCommission).toBe(16_250)
  })

  it('prefers a flat buyer-broker fee over the percentage when both are given', () => {
    const r = sellerNetSheet({ ...base, buyerBrokerFlat: 9_500 })
    const buyer = r.lines.find(l => l.label === 'Buyer broker compensation')!
    expect(buyer.amount).toBe(9_500)
    expect(buyer.note).toMatch(/Flat fee/)
  })

  it('computes per-diem payoff interest', () => {
    const r = sellerNetSheet(base)
    const perDiem = r.lines.find(l => l.label === 'Payoff interest')!
    expect(perDiem.amount).toBeCloseTo((310_000 * 0.0325 / 365) * 12, 1)
  })

  it('omits payoff interest when the rate or days are missing', () => {
    const r = sellerNetSheet({ ...base, payoffDays: undefined })
    expect(r.lines.some(l => l.label === 'Payoff interest')).toBe(false)
  })

  it('prorates property tax by days owned', () => {
    const r = sellerNetSheet({ ...base, annualPropertyTax: 7_300, taxProrationDays: 200 })
    const line = r.lines.find(l => l.label === 'Property tax proration')!
    expect(line.amount).toBeCloseTo((7300 / 365) * 200, 2)
  })

  it('separates commission, closing costs and payoffs', () => {
    const r = sellerNetSheet(base)
    expect(r.totalPayoffs).toBeGreaterThan(310_000)
    expect(r.totalClosingCosts).toBeCloseTo(2_100 + 900 + 650_000 * 0.0011 + 145, 2)
  })

  it('shows what another thousand on the price is really worth', () => {
    const r = sellerNetSheet(base)
    // 2.5% + 2.5% + 0.11% comes off the top of any increase.
    expect(r.marginalPerThousand).toBeCloseTo(1000 * (1 - 0.0511), 2)
    expect(r.marginalPerThousand).toBeLessThan(1000)
  })

  it('does not take a percentage cut against a flat buyer fee', () => {
    const r = sellerNetSheet({ ...base, buyerBrokerFlat: 9_500, buyerBrokerRate: 0.025 })
    expect(r.marginalPerThousand).toBeCloseTo(1000 * (1 - 0.0261), 2)
  })

  it('can go negative when the payoff exceeds the proceeds', () => {
    const r = sellerNetSheet({ ...base, mortgagePayoff: 640_000 })
    expect(r.netProceeds).toBeLessThan(0)
  })

  it('drops zero-value lines instead of showing $0 rows', () => {
    const r = sellerNetSheet({ salePrice: 400_000, listingSideRate: 0.03 })
    expect(r.lines).toHaveLength(1)
    expect(r.netProceeds).toBe(388_000)
  })

  it('includes arbitrary other costs', () => {
    const r = sellerNetSheet({ ...base, otherCosts: [{ label: 'Solar lease buyout', amount: 12_400 }] })
    expect(r.lines.find(l => l.label === 'Solar lease buyout')!.amount).toBe(12_400)
  })
})

describe('monthlyPayment', () => {
  it('amortises a standard 30-year loan', () => {
    // $400k at 6.5% over 30 years is a shade under $2,528.
    expect(monthlyPayment(400_000, 0.065, 30)).toBeCloseTo(2528.27, 1)
  })
  it('handles a zero-interest loan without dividing by zero', () => {
    expect(monthlyPayment(120_000, 0, 10)).toBe(1_000)
  })
  it('returns zero for a zero-length term', () => {
    expect(monthlyPayment(100_000, 0.05, 0)).toBe(0)
  })
})

describe('buyerCashToClose', () => {
  const base = {
    purchasePrice: 650_000,
    downPaymentPct: 0.20,
    interestRate: 0.0645,
    originationRate: 0.01,
    appraisal: 750,
    inspection: 550,
    lendersTitlePolicy: 1_100,
    escrowFee: 900,
    annualInsurance: 2_400,
    annualPropertyTax: 7_800,
    prepaidInterestDays: 11,
    earnestMoney: 10_000,
  }

  it('derives the loan and down payment from the percentage', () => {
    const r = buyerCashToClose(base)
    expect(r.loanAmount).toBe(520_000)
    expect(r.downPayment).toBe(130_000)
  })

  it('lets an explicit loan amount win over the percentage', () => {
    const r = buyerCashToClose({ ...base, loanAmount: 500_000 })
    expect(r.loanAmount).toBe(500_000)
    expect(r.downPayment).toBe(150_000)
  })

  it('sums cash to close as down payment plus costs plus prepaids less credits', () => {
    const r = buyerCashToClose(base)
    expect(r.cashToClose).toBeCloseTo(
      r.downPayment + r.totalClosingCosts + r.totalPrepaids - r.totalCredits, 2,
    )
  })

  it('credits earnest money already on deposit', () => {
    const withEm = buyerCashToClose(base)
    const withoutEm = buyerCashToClose({ ...base, earnestMoney: 0 })
    expect(withoutEm.cashToClose - withEm.cashToClose).toBeCloseTo(10_000, 2)
  })

  it('credits seller concessions', () => {
    const r = buyerCashToClose({ ...base, sellerConcessions: 8_000 })
    expect(r.totalCredits).toBe(18_000)
  })

  it('charges PMI under twenty percent down and not at or above it', () => {
    const low = buyerCashToClose({ ...base, downPaymentPct: 0.05 })
    const twenty = buyerCashToClose(base)
    expect(low.monthly.pmi).toBeGreaterThan(0)
    expect(twenty.monthly.pmi).toBe(0)
  })

  it('rolls tax, insurance, PMI and HOA into the monthly total', () => {
    const r = buyerCashToClose({ ...base, monthlyHoa: 185 })
    const m = r.monthly
    expect(m.total).toBeCloseTo(m.principalAndInterest + m.tax + m.insurance + m.pmi + m.hoa, 2)
    expect(m.hoa).toBe(185)
  })

  it('charges the buyer for compensation the seller is not covering', () => {
    const r = buyerCashToClose({ ...base, buyerBrokerShortfall: 6_500 })
    const line = r.closingCostLines.find(l => l.label.startsWith('Buyer broker'))!
    expect(line.amount).toBe(6_500)
    expect(line.note).toMatch(/buyer representation agreement/)
  })

  it('computes prepaid interest for the days given', () => {
    const r = buyerCashToClose(base)
    const line = r.prepaidLines.find(l => l.label === 'Prepaid interest')!
    expect(line.amount).toBeCloseTo((520_000 * 0.0645 / 365) * 11, 1)
  })

  it('defaults to three months of escrow reserves', () => {
    const r = buyerCashToClose(base)
    const tax = r.prepaidLines.find(l => l.label === 'Tax escrow reserve')!
    expect(tax.amount).toBeCloseTo((7_800 / 12) * 3, 2)
    expect(tax.note).toBe('3 months')
  })
})
