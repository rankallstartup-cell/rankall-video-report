// Plural display names for industry labels (b86p, b8bc). Pages used to
// append "s" to the label, which printed "Bakerys", "Car Washs", "Fence
// Companys", "Martial Artss" and "Music Lessonss". Labels that are not a
// countable noun ("HVAC", "Landscaping") get a readable plural noun.
const IRREGULAR: Record<string, string> = {
  'HVAC': 'HVAC Companies',
  'Real Estate': 'Real Estate Agents',
  'Auto Repair': 'Auto Repair Shops',
  'Landscaping': 'Landscapers',
  'Estate Planning': 'Estate Planning Attorneys',
  'Pest Control': 'Pest Control Companies',
  'Flooring': 'Flooring Companies',
  'Remodeling': 'Remodelers',
  'Roofing': 'Roofing Companies',
  'Catering': 'Caterers',
  'Tutoring': 'Tutors',
  'CrossFit': 'CrossFit Gyms',
  'Urgent Care': 'Urgent Care Clinics',
  'Martial Arts': 'Martial Arts Schools',
  'Music Lessons': 'Music Teachers',
  'Garage Door': 'Garage Door Companies',
  'Senior Care': 'Senior Care Providers',
};

export function industryPlural(label: string): string {
  if (IRREGULAR[label]) return IRREGULAR[label];
  if (/[^aeiou]y$/i.test(label)) return `${label.slice(0, -1)}ies`;
  if (/(s|sh|ch|x|z)$/i.test(label)) return `${label}es`;
  return `${label}s`;
}
