// Curated links live outside the rendering code so the library can be updated independently.
// Reading times are estimates for this app, not claims made by the publishers.
const DAYLIGHT_RESOURCES = [
  {
    id: 'chadd-peer-support',
    title: 'Find a CHADD chapter or support group',
    description: 'Search CHADD’s chapter network for in-person or virtual ADHD peer support and community.',
    purpose: 'Peer support can offer a chance to connect with others. Group availability and who a group serves varies by chapter; this directory is not clinical care or a crisis service.',
    category: 'Connection', publisher: 'CHADD', format: 'Directory', minutes: 3,
    kind: 'Peer support', url: 'https://chadd.org/chapter-locator/',
    keywords: ['peer', 'community', 'support group', 'chapter', 'connection', 'virtual']
  },
  {
    id: 'cdc-classroom',
    title: 'ADHD in the Classroom',
    description: 'An overview of school supports, organizational training, accommodations, breaks, and ways to reduce distractions.',
    purpose: 'Use this when you want a practical overview of how school environments and supports can be adapted. The page is general educational information for students, families, and school staff.',
    category: 'School support', publisher: 'Centers for Disease Control and Prevention', format: 'Guide', minutes: 6,
    kind: 'Public health information', url: 'https://www.cdc.gov/adhd/treatment/classroom.html',
    keywords: ['classroom', 'school', 'organization', 'breaks', 'accommodations', 'distraction']
  },
  {
    id: 'cdc-treatment',
    title: 'ADHD treatment and support',
    description: 'A plain-language overview of treatment options and how families, schools, and health professionals can work together.',
    purpose: 'A general introduction to ADHD care. It is not an individualized treatment plan; personal questions belong with a qualified health professional.',
    category: 'Understanding ADHD', publisher: 'Centers for Disease Control and Prevention', format: 'Article', minutes: 7,
    kind: 'Public health information', url: 'https://www.cdc.gov/adhd/treatment/',
    keywords: ['treatment', 'behavior', 'family', 'school', 'health', 'support']
  },
  {
    id: 'chadd-organize-teens',
    title: 'Help Teens Get Organized for School',
    description: 'Ideas for making time to plan, sort materials, and prepare for the school week.',
    purpose: 'A practical organization article from CHADD. Treat the ideas as options to adapt, not a checklist every student must follow.',
    category: 'Getting organized', publisher: 'CHADD', format: 'Article', minutes: 5,
    kind: 'Educational information', url: 'https://chadd.org/adhd-weekly/help-teens-get-organized-for-school/',
    keywords: ['teen', 'planning', 'school', 'materials', 'organization', 'weekly']
  },
  {
    id: 'chadd-homework',
    title: 'Homework Help for ADHD',
    description: 'A collection of homework support ideas for families, including planning and communication with school.',
    purpose: 'Family-facing educational information from CHADD. Students may want to read it together with a trusted adult and choose only the ideas that fit.',
    category: 'Homework', publisher: 'CHADD', format: 'Article', minutes: 8,
    kind: 'Educational information', url: 'https://chadd.org/for-parents/homework-help-for-adhd/',
    keywords: ['homework', 'parent', 'planning', 'assignments', 'school', 'support']
  },
  {
    id: 'aap-guideline',
    title: 'AAP ADHD Clinical Practice Guideline',
    description: 'Professional guidance on evaluating and treating ADHD in children and adolescents, including school supports.',
    purpose: 'This is a clinical guideline written for health professionals, not a student self-help guide. It explains why educational supports are part of coordinated ADHD care.',
    category: 'Professional guidance', publisher: 'American Academy of Pediatrics · Pediatrics', format: 'Clinical guidance', minutes: 20,
    kind: 'Professional guidance', url: 'https://publications.aap.org/pediatrics/article/144/4/e20192528/81590/clinical-practice-guideline-for-the-diagnosis',
    keywords: ['clinical', 'professional', 'school', 'education', 'treatment', 'guideline']
  }
];

function filterDaylightResources(items, filters = {}) {
  const query = (filters.query || '').trim().toLowerCase();
  const savedIds = filters.savedIds || [];
  return items.filter(resource => {
    const haystack = [resource.title, resource.description, resource.category, resource.publisher, resource.format, resource.kind, ...(resource.keywords || [])].join(' ').toLowerCase();
    const timeMatch = !filters.time || filters.time === 'all' ||
      (filters.time === 'short' && resource.minutes < 5) ||
      (filters.time === 'medium' && resource.minutes >= 5 && resource.minutes <= 15) ||
      (filters.time === 'long' && resource.minutes > 15);
    return (!query || haystack.includes(query)) &&
      (!filters.category || filters.category === 'all' || resource.category === filters.category) &&
      (!filters.format || filters.format === 'all' || resource.format === filters.format) &&
      timeMatch && (!filters.savedOnly || savedIds.includes(resource.id));
  });
}

if (typeof module !== 'undefined' && module.exports) module.exports = { resources: DAYLIGHT_RESOURCES, filterResources: filterDaylightResources };
if (typeof window !== 'undefined') {
  window.DAYLIGHT_RESOURCES = DAYLIGHT_RESOURCES;
  window.DAYLIGHT_FILTER_RESOURCES = filterDaylightResources;
}
