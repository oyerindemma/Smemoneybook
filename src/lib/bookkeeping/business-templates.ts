export type BusinessTemplate = {
  type: string;
  expenseCategories: string[];
};

export const businessTemplates: BusinessTemplate[] = [
  {
    type: "Retail",
    expenseCategories: ["Stock purchase", "Transport", "Rent", "Staff", "POS charges", "Other"],
  },
  {
    type: "Retail shop",
    expenseCategories: ["Stock purchase", "Transport", "Rent", "Staff", "POS charges", "Other"],
  },
  {
    type: "Services",
    expenseCategories: ["Transport", "Tools", "Internet", "Staff", "Marketing", "Other"],
  },
  {
    type: "Freelancer",
    expenseCategories: ["Internet", "Transport", "Tools", "Data", "Marketing", "Other"],
  },
  {
    type: "POS business",
    expenseCategories: ["Cash withdrawal", "POS charges", "Transport", "Data", "Repairs", "Other"],
  },
  {
    type: "Food",
    expenseCategories: ["Food ingredients", "Gas", "Delivery", "Staff", "Packaging", "Other"],
  },
  {
    type: "Restaurant",
    expenseCategories: ["Food ingredients", "Gas", "Delivery", "Staff", "Packaging", "Other"],
  },
  {
    type: "Food business",
    expenseCategories: ["Food ingredients", "Gas", "Delivery", "Staff", "Packaging", "Other"],
  },
  {
    type: "Fashion",
    expenseCategories: ["Fabric", "Logistics", "Tailoring", "Accessories", "Staff", "Other"],
  },
  {
    type: "Pharmacy",
    expenseCategories: ["Medicine stock", "Transport", "Rent", "Staff", "Power", "Other"],
  },
  {
    type: "Beauty salon",
    expenseCategories: ["Hair products", "Power", "Rent", "Staff", "Tools", "Other"],
  },
  {
    type: "Electronics",
    expenseCategories: ["Stock purchase", "Repairs", "Transport", "Rent", "Staff", "Other"],
  },
  {
    type: "Logistics",
    expenseCategories: ["Fuel", "Repairs", "Driver pay", "Data", "Loading fee", "Other"],
  },
  {
    type: "Other",
    expenseCategories: ["Stock purchase", "Transport", "Rent", "Staff", "Marketing", "Other"],
  },
];

export function getBusinessTemplate(type?: string | null) {
  return (
    businessTemplates.find((template) => template.type === type) ??
    businessTemplates[0]
  );
}
