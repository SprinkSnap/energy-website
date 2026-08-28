import { DEMO_USER } from "@/lib/constants";
import { createEmptyProject, type Project, type UserAccount } from "@/lib/types";

export const demoAccount: UserAccount = { ...DEMO_USER };

function withPricing(
  project: Project,
  fee: number,
): Project {
  const hst = Math.round(fee * 0.13 * 100) / 100;
  const total = Math.round((fee + hst) * 100) / 100;
  const deposit = Math.round((total / 2) * 100) / 100;
  return {
    ...project,
    pricing: {
      professionalFee: fee,
      hst,
      total,
      deposit,
      final: Math.round((total - deposit) * 100) / 100,
    },
  };
}

export function seedDemoProjects(): Project[] {
  const wellington = withPricing(createEmptyProject("SB12-00124"), 1480);
  const cambridge = withPricing(createEmptyProject("SB12-00123"), 1860);
  const oakwood = withPricing(createEmptyProject("SB12-00122"), 1720);

  return [
    {
      ...wellington,
      route: "known-specs",
      status: "in-progress",
      payment: "deposit-paid",
      proposalAccepted: true,
      confirmed: true,
      wizardStep: "review",
      info: {
        builder: "Wellington Homes",
        modelName: "Wellington",
        elevation: "A / Series 2",
        address: "184 Maple Ridge Drive",
        city: "Milton",
        postalCode: "L9T 4B2",
      },
      foundations: ["basement"],
      insulation: {
        ...wellington.insulation,
        ceilingAttic: { value: "R60", other: "", notes: "" },
        ceilingNoAttic: { value: "R31", other: "", notes: "" },
        exposedFloor: { value: "R31", other: "", notes: "" },
        wallsAboveGrade: {
          cavity: "R22",
          cavityOther: "",
          continuous: "R5 CI",
          continuousOther: "",
          notes: "",
        },
        basementWalls: { value: "R20 CI", other: "", notes: "" },
        belowSlab: { value: "R10", other: "", notes: "" },
      },
      windows: { windows: "u12-er34", skylights: "no", skylightUValue: "2.8" },
      mechanical: {
        ...wellington.mechanical,
        heatingFuel: "natural-gas",
        heatingEquipment:
          "Min. 96% AFUE Furnace with ECM Motor (or ESNH Certified)",
        heatingMfr: "Carrier",
        heatingModel: "59MN7A060V17-14",
        coolingEquipment: "Air Conditioning",
        coolingMfr: "Carrier",
        coolingModel: "24VNA9",
        hrvMfr: "Venmar",
        hrvModel: "AVS E15 ECM",
        dhwFuel: "natural-gas",
        dhwMfr: "Rheem",
        dhwModel: "PROG50-38N RH62",
        dhwEfficiencyType: "uef",
        dhwEfficiency: "0.68",
        dwhr: "installed",
        dwhrEfficiency: "42",
        dwhrShowers: "2",
        combined: "no",
      },
      drawings: [
        {
          name: "Wellington-A-Permit-Set.pdf",
          size: 12400000,
          type: "application/pdf",
          uploadedAt: "2026-08-12T14:22:00.000Z",
        },
      ],
    },
    {
      ...cambridge,
      route: "custom-optimization",
      status: "complete",
      payment: "paid-in-full",
      proposalAccepted: true,
      selectedOption: "A",
      confirmed: true,
      wizardStep: "review",
      info: {
        builder: "Cambridge Builders",
        modelName: "Cambridge",
        elevation: "B",
        address: "42 Oakridge Court",
        city: "Cambridge",
        postalCode: "N1R 5S2",
      },
      foundations: ["basement", "walkout-basement"],
      insulation: {
        ...cambridge.insulation,
        ceilingAttic: { value: "R60", other: "", notes: "Blown cellulose" },
        ceilingNoAttic: { value: "R31", other: "", notes: "" },
        exposedFloor: { value: "R35", other: "", notes: "" },
        wallsAboveGrade: {
          cavity: "R22",
          cavityOther: "",
          continuous: "R5 CI",
          continuousOther: "",
          notes: "",
        },
        basementWalls: { value: "R20 CI", other: "", notes: "" },
        belowSlab: { value: "R10", other: "", notes: "" },
      },
      windows: { windows: "u14-er29", skylights: "no", skylightUValue: "2.8" },
      mechanical: {
        ...cambridge.mechanical,
        heatingFuel: "natural-gas",
        heatingEquipment:
          "Min. 96% AFUE Furnace with ECM Motor (or ESNH Certified)",
        heatingMfr: "Lennox",
        heatingModel: "SLP99UH070XV36B",
        coolingEquipment: "N/A",
        hrvMfr: "Lifebreath",
        hrvModel: "155MAX",
        dhwFuel: "natural-gas",
        dhwMfr: "Bradford White",
        dhwModel: "RG250H6N",
        dhwEfficiencyType: "uef",
        dhwEfficiency: "0.64",
        dwhr: "installed",
        dwhrEfficiency: "46",
        dwhrShowers: "3",
        combined: "no",
      },
      drawings: [
        {
          name: "Cambridge-B-Architectural.pdf",
          size: 9800000,
          type: "application/pdf",
          uploadedAt: "2026-07-02T10:08:00.000Z",
        },
      ],
    },
    {
      ...oakwood,
      route: "over-22-wwr",
      over22Path: "path-1-known",
      status: "draft",
      payment: "none",
      wizardStep: "windows",
      info: {
        builder: "Oakwood Developments",
        modelName: "Oakwood",
        elevation: "Modern 1",
        address: "9 Lakeshore Crescent",
        city: "Oakville",
        postalCode: "L6J 1J4",
      },
      foundations: ["basement", "walkout-deck"],
      insulation: {
        ...oakwood.insulation,
        ceilingAttic: { value: "R50", other: "", notes: "" },
        wallsAboveGrade: {
          cavity: "R22",
          cavityOther: "",
          continuous: "Other",
          continuousOther: "R7.5 CI",
          notes: "Higher CI proposed for WWR",
        },
        basementWalls: { value: "R20 CI", other: "", notes: "" },
        belowSlab: { value: "R10", other: "", notes: "" },
      },
      windows: { windows: "u12-er34", skylights: "yes", skylightUValue: "2.8" },
    },
  ];
}
