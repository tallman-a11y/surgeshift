/**
 * Seller net sheets and buyer cash-to-close.
 *
 * Post-NAR-settlement this is not the arithmetic it used to be. Buyer-broker
 * compensation is no longer published in the MLS and no longer flows automatically
 * off the listing side, so it is modelled here as what it now is: a separately
 * negotiated line the seller may or may not agree to pay, on top of a listing-side
 * fee that is its own number. A net sheet that still shows one blended "6%" is
 * describing a market that stopped existing in August 2024.
 */

import { round } from './money'

export type SellerNetInput = {
  salePrice: number
  /** Listing-side fee as a decimal, e.g. 0.025. */
  listingSideRate: number
  /**
   * What the seller has agreed to pay the buyer's broker, as a decimal of sale price.
   * Zero is now a real and common answer — the buyer may be paying their own agent.
   */
  buyerBrokerRate?: number
  /** A flat buyer-broker fee instead of a percentage, if that is what was negotiated. */
  buyerBrokerFlat?: number
  /** Seller-paid closing-cost help written into the contract. */
  concessions?: number
  mortgagePayoff?: number
  /** Annual interest rate on the loan being paid off, for the per-diem. */
  payoffRate?: number
  /** Days of interest between the last payment and funding. */
  payoffDays?: number
  secondLienPayoff?: number
  /** Owner's title policy. Who pays is regional; pass 0 where the buyer covers it. */
  titlePolicy?: number
  escrowFee?: number
  settlementFee?: number
  attorneyFee?: number
  /** State/county transfer tax as a decimal of sale price. */
  transferTaxRate?: number
  recordingFees?: number
  hoaTransferFee?: number
  homeWarranty?: number
  /** Repairs or credits agreed after inspection. */
  repairCredits?: number
  stagingAndPrep?: number
  /** Annual property tax, prorated to the closing date. */
  annualPropertyTax?: number
  /** Days of the tax year the seller owns, for the proration. */
  taxProrationDays?: number
  otherCosts?: { label: string; amount: number }[]
}

export type NetSheetLine = { label: string; amount: number; note?: string }

export type SellerNetResult = {
  salePrice: number
  lines: NetSheetLine[]
  totalCommission: number
  totalClosingCosts: number
  totalPayoffs: number
  netProceeds: number
  /** Net as a share of sale price — the number sellers actually remember. */
  netPct: number
  /** What each $1,000 of price change is worth to the seller after costs. */
  marginalPerThousand: number
}

const DAYS_IN_YEAR = 365

export function sellerNetSheet(input: SellerNetInput): SellerNetResult {
  const p = input.salePrice
  const lines: NetSheetLine[] = []
  const add = (label: string, amount: number, note?: string) => {
    if (amount > 0) lines.push({ label, amount: round(amount, 2), note })
  }

  const listingSide = p * input.listingSideRate
  const buyerSide = input.buyerBrokerFlat != null && input.buyerBrokerFlat > 0
    ? input.buyerBrokerFlat
    : p * (input.buyerBrokerRate ?? 0)

  add('Listing brokerage fee', listingSide, `${round(input.listingSideRate * 100, 2)}% of sale price`)
  if (buyerSide > 0) {
    add(
      'Buyer broker compensation',
      buyerSide,
      input.buyerBrokerFlat
        ? 'Flat fee, separately negotiated'
        : `${round((input.buyerBrokerRate ?? 0) * 100, 2)}% — separately negotiated, not via MLS`,
    )
  }
  const totalCommission = listingSide + buyerSide

  add('Seller concessions', input.concessions ?? 0, 'Closing-cost help written into the contract')
  add('Owner’s title policy', input.titlePolicy ?? 0)
  add('Escrow fee', input.escrowFee ?? 0)
  add('Settlement / closing fee', input.settlementFee ?? 0)
  add('Attorney fee', input.attorneyFee ?? 0)

  const transferTax = p * (input.transferTaxRate ?? 0)
  add('Transfer tax', transferTax, input.transferTaxRate
    ? `${round((input.transferTaxRate ?? 0) * 100, 3)}% of sale price` : undefined)

  add('Recording fees', input.recordingFees ?? 0)
  add('HOA transfer / estoppel', input.hoaTransferFee ?? 0)
  add('Home warranty', input.homeWarranty ?? 0)
  add('Repairs & inspection credits', input.repairCredits ?? 0)
  add('Staging & listing prep', input.stagingAndPrep ?? 0)

  const taxProration = input.annualPropertyTax && input.taxProrationDays
    ? (input.annualPropertyTax / DAYS_IN_YEAR) * input.taxProrationDays
    : 0
  add('Property tax proration', taxProration,
    input.taxProrationDays ? `${input.taxProrationDays} days of the tax year` : undefined)

  for (const o of input.otherCosts ?? []) add(o.label, o.amount)

  const perDiem = input.mortgagePayoff && input.payoffRate && input.payoffDays
    ? (input.mortgagePayoff * input.payoffRate / DAYS_IN_YEAR) * input.payoffDays
    : 0
  add('First mortgage payoff', input.mortgagePayoff ?? 0)
  add('Payoff interest', perDiem, input.payoffDays ? `${input.payoffDays} days per-diem` : undefined)
  add('Second lien payoff', input.secondLienPayoff ?? 0)

  const totalPayoffs = (input.mortgagePayoff ?? 0) + perDiem + (input.secondLienPayoff ?? 0)
  const totalOut = lines.reduce((s, l) => s + l.amount, 0)
  const totalClosingCosts = totalOut - totalCommission - totalPayoffs
  const netProceeds = p - totalOut

  // What another $1,000 on the price is actually worth once the percentage-based
  // costs take their cut. Sellers negotiate very differently once they see this.
  const rateOfPercentageCosts =
    input.listingSideRate +
    (input.buyerBrokerFlat ? 0 : (input.buyerBrokerRate ?? 0)) +
    (input.transferTaxRate ?? 0)
  const marginalPerThousand = 1000 * (1 - rateOfPercentageCosts)

  return {
    salePrice: p,
    lines,
    totalCommission: round(totalCommission, 2),
    totalClosingCosts: round(totalClosingCosts, 2),
    totalPayoffs: round(totalPayoffs, 2),
    netProceeds: round(netProceeds, 2),
    netPct: p > 0 ? netProceeds / p : 0,
    marginalPerThousand: round(marginalPerThousand, 2),
  }
}

export type BuyerCostInput = {
  purchasePrice: number
  /** Decimal, e.g. 0.20. Ignored when loanAmount is given. */
  downPaymentPct?: number
  loanAmount?: number
  /** Annual note rate as a decimal, e.g. 0.0645. */
  interestRate: number
  termYears?: number
  /** Points and origination as a decimal of the loan. */
  originationRate?: number
  lenderFees?: number
  appraisal?: number
  inspection?: number
  lendersTitlePolicy?: number
  ownersTitlePolicy?: number
  escrowFee?: number
  recordingFees?: number
  transferTaxRate?: number
  /** Annual homeowner's insurance premium. */
  annualInsurance?: number
  annualPropertyTax?: number
  monthlyHoa?: number
  /** Months of taxes and insurance the lender holds in reserve. */
  escrowReserveMonths?: number
  /** Days of prepaid interest to the end of the closing month. */
  prepaidInterestDays?: number
  earnestMoney?: number
  sellerConcessions?: number
  /** What the buyer owes their own agent that the seller is not covering. */
  buyerBrokerShortfall?: number
  /** Annual PMI rate as a decimal of the loan, applied under 20% down. */
  pmiRate?: number
}

export type BuyerCostResult = {
  purchasePrice: number
  loanAmount: number
  downPayment: number
  closingCostLines: NetSheetLine[]
  prepaidLines: NetSheetLine[]
  totalClosingCosts: number
  totalPrepaids: number
  credits: NetSheetLine[]
  totalCredits: number
  cashToClose: number
  monthly: {
    principalAndInterest: number
    tax: number
    insurance: number
    pmi: number
    hoa: number
    total: number
  }
}

/** Standard amortising payment. Handles a 0% rate without dividing by zero. */
export function monthlyPayment(principal: number, annualRate: number, years: number): number {
  const n = years * 12
  if (n <= 0) return 0
  const r = annualRate / 12
  if (r === 0) return principal / n
  return (principal * r) / (1 - Math.pow(1 + r, -n))
}

export function buyerCashToClose(input: BuyerCostInput): BuyerCostResult {
  const p = input.purchasePrice
  const loanAmount = input.loanAmount ?? p * (1 - (input.downPaymentPct ?? 0.2))
  const downPayment = p - loanAmount
  const termYears = input.termYears ?? 30

  const closingCostLines: NetSheetLine[] = []
  const addCost = (label: string, amount: number, note?: string) => {
    if (amount > 0) closingCostLines.push({ label, amount: round(amount, 2), note })
  }

  const origination = loanAmount * (input.originationRate ?? 0)
  addCost('Loan origination / points', origination,
    input.originationRate ? `${round((input.originationRate ?? 0) * 100, 3)}% of loan` : undefined)
  addCost('Other lender fees', input.lenderFees ?? 0)
  addCost('Appraisal', input.appraisal ?? 0)
  addCost('Inspection', input.inspection ?? 0)
  addCost('Lender’s title policy', input.lendersTitlePolicy ?? 0)
  addCost('Owner’s title policy', input.ownersTitlePolicy ?? 0)
  addCost('Escrow / settlement fee', input.escrowFee ?? 0)
  addCost('Recording fees', input.recordingFees ?? 0)
  addCost('Transfer tax', p * (input.transferTaxRate ?? 0))
  addCost('Buyer broker compensation (not seller-paid)', input.buyerBrokerShortfall ?? 0,
    'Owed under the buyer representation agreement')

  const prepaidLines: NetSheetLine[] = []
  const addPrepaid = (label: string, amount: number, note?: string) => {
    if (amount > 0) prepaidLines.push({ label, amount: round(amount, 2), note })
  }

  const reserveMonths = input.escrowReserveMonths ?? 3
  addPrepaid('Homeowner’s insurance (12 mo)', input.annualInsurance ?? 0, 'Paid in full at closing')
  addPrepaid('Tax escrow reserve', ((input.annualPropertyTax ?? 0) / 12) * reserveMonths,
    `${reserveMonths} months`)
  addPrepaid('Insurance escrow reserve', ((input.annualInsurance ?? 0) / 12) * reserveMonths,
    `${reserveMonths} months`)
  const prepaidInterest = input.prepaidInterestDays
    ? (loanAmount * input.interestRate / DAYS_IN_YEAR) * input.prepaidInterestDays
    : 0
  addPrepaid('Prepaid interest', prepaidInterest,
    input.prepaidInterestDays ? `${input.prepaidInterestDays} days` : undefined)

  const credits: NetSheetLine[] = []
  if ((input.earnestMoney ?? 0) > 0) credits.push({ label: 'Earnest money on deposit', amount: round(input.earnestMoney!, 2) })
  if ((input.sellerConcessions ?? 0) > 0) credits.push({ label: 'Seller concessions', amount: round(input.sellerConcessions!, 2) })

  const totalClosingCosts = closingCostLines.reduce((s, l) => s + l.amount, 0)
  const totalPrepaids = prepaidLines.reduce((s, l) => s + l.amount, 0)
  const totalCredits = credits.reduce((s, l) => s + l.amount, 0)
  const cashToClose = downPayment + totalClosingCosts + totalPrepaids - totalCredits

  const pi = monthlyPayment(loanAmount, input.interestRate, termYears)
  const ltv = p > 0 ? loanAmount / p : 0
  const pmi = ltv > 0.8 ? (loanAmount * (input.pmiRate ?? 0.006)) / 12 : 0
  const tax = (input.annualPropertyTax ?? 0) / 12
  const insurance = (input.annualInsurance ?? 0) / 12
  const hoa = input.monthlyHoa ?? 0

  return {
    purchasePrice: p,
    loanAmount: round(loanAmount, 2),
    downPayment: round(downPayment, 2),
    closingCostLines,
    prepaidLines,
    totalClosingCosts: round(totalClosingCosts, 2),
    totalPrepaids: round(totalPrepaids, 2),
    credits,
    totalCredits: round(totalCredits, 2),
    cashToClose: round(cashToClose, 2),
    monthly: {
      principalAndInterest: round(pi, 2),
      tax: round(tax, 2),
      insurance: round(insurance, 2),
      pmi: round(pmi, 2),
      hoa: round(hoa, 2),
      total: round(pi + tax + insurance + pmi + hoa, 2),
    },
  }
}
