export type ServiceRoute =
  | "known-specs"
  | "custom-optimization"
  | "over-22-wwr";

export type Over22Path = "path-1-known" | "path-2-help" | null;

export type ProjectStatus =
  | "draft"
  | "submitted"
  | "kickoff-call"
  | "optimization"
  | "options-review"
  | "client-selection"
  | "project-review"
  | "proposal"
  | "awaiting-deposit"
  | "in-progress"
  | "final-payment-required"
  | "complete";

export type PaymentStatus = "none" | "unpaid" | "deposit-paid" | "paid-in-full";

export type FoundationType =
  | "basement"
  | "crawlspace"
  | "walkout-basement"
  | "walkout-deck"
  | "slab-on-grade";

export type WizardStepId =
  | "account"
  | "service"
  | "project"
  | "foundation"
  | "insulation"
  | "windows"
  | "mechanical"
  | "drawings"
  | "review";

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  company?: string;
  phone?: string;
  password: string;
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  company?: string;
  phone?: string;
}

export interface ProjectInfo {
  builder: string;
  modelName: string;
  elevation: string;
  address: string;
  city: string;
  postalCode: string;
}

export interface InsulationChoice {
  value: string;
  other: string;
  notes: string;
}

export interface WallsAboveGrade {
  cavity: string;
  cavityOther: string;
  continuous: string;
  continuousOther: string;
  notes: string;
}

export interface WindowsGlazing {
  windows: "" | "u12-er34" | "u14-er29" | "u16-er25";
  skylights: "" | "yes" | "no";
  skylightUValue: string;
}

export interface MechanicalSystems {
  heatingFuel: "" | "electric" | "natural-gas" | "propane";
  heatingEquipment: string;
  heatingMfr: string;
  heatingModel: string;
  coolingEquipment: string;
  coolingMfr: string;
  coolingModel: string;
  hrvMfr: string;
  hrvModel: string;
  dhwFuel: "" | "electric" | "natural-gas" | "propane";
  dhwMfr: string;
  dhwModel: string;
  dhwEfficiencyType: "" | "ef" | "te" | "uef";
  dhwEfficiency: string;
  dwhr: "" | "installed" | "evaluate-without" | "not-sure";
  dwhrEfficiency: string;
  dwhrShowers: string;
  combined: "" | "no" | "yes" | "not-sure";
  combinedSystemType: string;
  combinedFuel: string;
  combinedMfr: string;
  combinedModel: string;
  combinedEfficiency: string;
}

export interface DrawingFile {
  name: string;
  size: number;
  type: string;
  uploadedAt: string;
}

export interface ProjectPricing {
  professionalFee: number;
  hst: number;
  total: number;
  deposit: number;
  final: number;
}

export interface Project {
  id: string;
  createdAt: string;
  updatedAt: string;
  route: ServiceRoute | null;
  over22Path: Over22Path;
  info: ProjectInfo;
  foundations: FoundationType[];
  insulation: {
    ceilingAttic: InsulationChoice;
    ceilingNoAttic: InsulationChoice;
    exposedFloor: InsulationChoice;
    wallsAboveGrade: WallsAboveGrade;
    basementWalls: InsulationChoice;
    belowSlab: InsulationChoice;
  };
  windows: WindowsGlazing;
  mechanical: MechanicalSystems;
  drawings: DrawingFile[];
  confirmed: boolean;
  status: ProjectStatus;
  payment: PaymentStatus;
  selectedOption?: "A" | "B" | "C" | null;
  proposalAccepted?: boolean;
  pricing: ProjectPricing;
  wizardStep: WizardStepId;
}

export const emptyInsulation = (): InsulationChoice => ({
  value: "",
  other: "",
  notes: "",
});

export function createEmptyProject(id: string): Project {
  const now = new Date().toISOString();
  return {
    id,
    createdAt: now,
    updatedAt: now,
    route: null,
    over22Path: null,
    info: {
      builder: "",
      modelName: "",
      elevation: "",
      address: "",
      city: "",
      postalCode: "",
    },
    foundations: [],
    insulation: {
      ceilingAttic: emptyInsulation(),
      ceilingNoAttic: emptyInsulation(),
      exposedFloor: emptyInsulation(),
      wallsAboveGrade: {
        cavity: "",
        cavityOther: "",
        continuous: "",
        continuousOther: "",
        notes: "",
      },
      basementWalls: emptyInsulation(),
      belowSlab: emptyInsulation(),
    },
    windows: {
      windows: "",
      skylights: "",
      skylightUValue: "2.8",
    },
    mechanical: {
      heatingFuel: "",
      heatingEquipment: "",
      heatingMfr: "",
      heatingModel: "",
      coolingEquipment: "",
      coolingMfr: "",
      coolingModel: "",
      hrvMfr: "",
      hrvModel: "",
      dhwFuel: "",
      dhwMfr: "",
      dhwModel: "",
      dhwEfficiencyType: "",
      dhwEfficiency: "",
      dwhr: "",
      dwhrEfficiency: "",
      dwhrShowers: "",
      combined: "",
      combinedSystemType: "",
      combinedFuel: "",
      combinedMfr: "",
      combinedModel: "",
      combinedEfficiency: "",
    },
    drawings: [],
    confirmed: false,
    status: "draft",
    payment: "none",
    selectedOption: null,
    proposalAccepted: false,
    pricing: {
      professionalFee: 1480,
      hst: 192.4,
      total: 1672.4,
      deposit: 836.2,
      final: 836.2,
    },
    wizardStep: "service",
  };
}
