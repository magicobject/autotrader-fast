// An Autotrader advert page's own data (window.__staticRouterHydrationData), validated and
// flattened into the fields the table sorts on and the advert panel shows.
import * as z from 'zod/mini';
import { advertIdSchema, epochMsSchema, type AdvertId, type EpochMs } from '../shared/brands.ts';
import { firstNumberIn } from '../shared/numbers.ts';

const labelledValueSchema = z.object({ label: z.nullish(z.string()), value: z.nullish(z.string()) });
const specificationItemSchema = z.object({ name: z.string(), value: z.string() });

const advertPageDataSchema = z.object({
  loaderData: z.object({
    'car-details': z.object({
      advertData: z.nullish(
        z.object({
          id: z.nullish(z.union([z.string(), z.number()])),
          description: z.nullish(z.union([z.string(), z.array(z.string())])),
          strapline: z.nullish(z.union([z.string(), z.array(z.string())])),
        }),
      ),
      vehicleData: z.nullish(
        z.object({
          registration: z.nullish(z.string()),
          keySpecification: z.nullish(z.array(z.object({ specKey: z.string(), value: z.nullish(z.string()) }))),
          specifications: z.nullish(z.array(z.object({ category: z.string(), items: z.nullish(z.array(specificationItemSchema)) }))),
          runningCosts: z.nullish(z.array(z.object({ key: z.string(), value: z.nullish(z.string()) }))),
        }),
      ),
      advert: z.nullish(
        z.object({
          history: z.nullish(
            z.object({
              ownersData: z.nullish(labelledValueSchema),
              serviceHistory: z.nullish(z.object({ description: z.nullish(z.string()), historyType: z.nullish(z.string()) })),
              mot: z.nullish(z.object({ status: z.nullish(z.string()) })),
              vehicleCheck: z.nullish(
                z.object({
                  status: z.nullish(z.string()),
                  statusText: z.nullish(z.string()),
                  detailChecks: z.nullish(z.array(z.object({ label: z.string(), status: z.string() }))),
                  basicChecks: z.nullish(z.array(z.object({ label: z.string(), status: z.string() }))),
                }),
              ),
            }),
          ),
          advertTrackingData: z.nullish(
            z.object({
              advertContext: z.nullish(
                z.object({
                  make: z.nullish(z.string()),
                  model: z.nullish(z.string()),
                  mileage: z.nullish(z.number()),
                  year: z.nullish(z.number()),
                  price: z.nullish(z.number()),
                }),
              ),
              vehicleContext: z.nullish(
                z.object({
                  standardMake: z.nullish(z.string()),
                  fuelType: z.nullish(z.string()),
                  transmission: z.nullish(z.string()),
                  bodyType: z.nullish(z.string()),
                  colour: z.nullish(z.string()),
                  standardDrivetrain: z.nullish(z.string()),
                }),
              ),
            }),
          ),
        }),
      ),
    }),
  }),
});

const performanceFigureSchema = z.object({ name: z.string(), value: z.string() });
export type PerformanceFigure = z.infer<typeof performanceFigureSchema>;

const nullableNumber = z.nullable(z.number());
const nullableText = z.nullable(z.string());

/**
 * The flattened details we keep for each advert. Plain data, so it can be cached in
 * chrome.storage; the same schema validates it when it is read back.
 */
export const advertDetailsSchema = z.object({
  advertId: advertIdSchema,
  performance: z.readonly(z.array(performanceFigureSchema)),
  zeroTo62Seconds: nullableNumber,
  topSpeedMph: nullableNumber,
  enginePowerBhp: nullableNumber,
  torqueNm: nullableNumber,
  milesPerGallon: nullableNumber,
  insuranceGroup: nullableText,
  insuranceGroupNumber: nullableNumber,
  roadTaxPerYearGbp: nullableNumber,
  co2GramsPerKm: nullableNumber,
  fuelType: nullableText,
  gearbox: nullableText,
  bodyType: nullableText,
  colour: nullableText,
  drivetrain: nullableText,
  mileage: nullableNumber,
  ownerCount: nullableNumber,
  serviceHistory: nullableText,
  motStatus: nullableText,
  autotraderCheck: z.enum(['passed', 'flagged', 'unknown']),
  autotraderCheckText: nullableText,
  autotraderCheckProblems: z.readonly(z.array(z.string())),
  make: nullableText,
  model: nullableText,
  fetchedAtMs: epochMsSchema,
});
export type AdvertDetails = Readonly<z.infer<typeof advertDetailsSchema>>;

export interface AdvertPageReading {
  readonly details: AdvertDetails;
  /** The seller's description, used only to look for a registration; not stored. */
  readonly sellerDescription: string;
  /** The advert id as the page states it, to confirm it is the advert we asked for. */
  readonly statedAdvertId: string | null;
}

const HYDRATION_ASSIGNMENT = /window\.__staticRouterHydrationData\s*=\s*JSON\.parse\("((?:[^"\\]|\\.)*)"\)/;

/** Finds and decodes the page data embedded in an advert page's HTML. Null when it isn't there. */
export function extractAdvertPageData(html: string): unknown {
  const encoded = html.match(HYDRATION_ASSIGNMENT)?.[1];
  if (encoded === undefined) return null;
  try {
    const jsonText: unknown = JSON.parse(`"${encoded}"`);
    return typeof jsonText === 'string' ? (JSON.parse(jsonText) as unknown) : null;
  } catch {
    return null;
  }
}

function joinText(text: string | readonly string[] | null | undefined): string {
  return text === null || text === undefined ? '' : typeof text === 'string' ? text : text.join('\n');
}

export function readAdvertPageData(pageData: unknown, advertId: AdvertId, fetchedAtMs: EpochMs): AdvertPageReading | null {
  const parsed = advertPageDataSchema.safeParse(pageData);
  if (!parsed.success) return null;
  const carDetails = parsed.data.loaderData['car-details'];
  const vehicle = carDetails.vehicleData;
  const history = carDetails.advert?.history;
  const advertContext = carDetails.advert?.advertTrackingData?.advertContext;
  const vehicleContext = carDetails.advert?.advertTrackingData?.vehicleContext;

  const performance = vehicle?.specifications?.find((category) => category.category === 'Performance')?.items ?? [];
  const performanceValue = (name: string): number | null => firstNumberIn(performance.find((item) => item.name === name)?.value);
  const keySpecification = (specKey: string): string | null =>
    vehicle?.keySpecification?.find((spec) => spec.specKey === specKey)?.value ?? null;
  const runningCost = (key: string): string | null => vehicle?.runningCosts?.find((cost) => cost.key === key)?.value ?? null;

  const checks = history?.vehicleCheck?.detailChecks ?? history?.vehicleCheck?.basicChecks ?? [];
  const checkStatus = history?.vehicleCheck?.status;
  const insuranceGroup = runningCost('Insurance');
  const statedId = carDetails.advertData?.id;

  return {
    statedAdvertId: statedId === null || statedId === undefined ? null : String(statedId),
    sellerDescription: [joinText(carDetails.advertData?.description), joinText(carDetails.advertData?.strapline)].join('\n'),
    details: {
      advertId,
      performance,
      zeroTo62Seconds: performanceValue('0-62mph'),
      topSpeedMph: performanceValue('Top speed'),
      enginePowerBhp: performanceValue('Engine power'),
      torqueNm: performanceValue('Engine torque'),
      milesPerGallon: performanceValue('Miles per gallon') ?? firstNumberIn(runningCost('FUEL_AVERAGE')),
      insuranceGroup,
      insuranceGroupNumber: firstNumberIn(insuranceGroup),
      roadTaxPerYearGbp: firstNumberIn(runningCost('Tax')),
      co2GramsPerKm: firstNumberIn(runningCost('Emission')),
      fuelType: keySpecification('FUELTYPE') ?? vehicleContext?.fuelType ?? null,
      gearbox: keySpecification('GEARBOX') ?? vehicleContext?.transmission ?? null,
      bodyType: keySpecification('BODYTYPE') ?? vehicleContext?.bodyType ?? null,
      colour: keySpecification('BODYCOLOUR') ?? vehicleContext?.colour ?? null,
      drivetrain: vehicleContext?.standardDrivetrain ?? null,
      mileage: advertContext?.mileage ?? firstNumberIn(keySpecification('MILEAGE')),
      ownerCount: firstNumberIn(history?.ownersData?.value),
      serviceHistory: history?.serviceHistory?.description ?? history?.serviceHistory?.historyType ?? null,
      motStatus: history?.mot?.status ?? null,
      autotraderCheck: checkStatus === 'PASSED' ? 'passed' : checkStatus ? 'flagged' : 'unknown',
      autotraderCheckText: history?.vehicleCheck?.statusText ?? null,
      autotraderCheckProblems: checks.filter((check) => check.status !== 'PASSED').map((check) => check.label),
      make: advertContext?.make ?? vehicleContext?.standardMake ?? null,
      model: advertContext?.model ?? null,
      fetchedAtMs,
    },
  };
}
