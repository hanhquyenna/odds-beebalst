/** The test students shared by check-students.ts and check-profile-facts.ts. */
import { DEFAULT_PROFILE, type Profile } from "../src/lib/types"

const pos = (Title: string, company: string, Location: string, from: string, to: string, Description = "") => ({ Title, "Company Name": company, Location, "Started On": from, "Finished On": to, Description })
const edu = (school: string, degree: string, field = "") => ({ "School Name": school, "Degree Name": degree, "Field Of Study": field })
const make = (o: Partial<Profile>): Profile => ({ ...DEFAULT_PROFILE, onboarded: true, ...o })

export interface Student {
  name: string
  profile: Profile
  /** What a careful person reads as the highest degree. */
  degree: "bachelor" | "master" | "phd" | "unknown"
  /** Between these many years of work (the dates are written so this is clear). */
  years: [number, number]
  /** Studying now, as a careful person reads the dates and answers: true, false, or null when nothing says. Omitted: null. */
  studying?: boolean | null
  /** At least this share of the ten best jobs must be in one of these lines of work. Omitted: not checked. */
  topFamilies?: string[]
}

export const FIN = ["Finance & accounting", "Risk, compliance & legal", "Consulting & strategy"]
export const TECH = ["Software engineering", "Data, analytics & AI", "IT, cloud & security"]

export const STUDENTS: Student[] = [
  { name: "India: B.Tech CSE, one internship", degree: "bachelor", years: [0.1, 0.6], topFamilies: TECH,
    profile: make({ permit: "orientation_year", birth: 2001, origin: "non_eu", dutch: "none", cv: "B.Tech Computer Science. Java, Python, SQL, React. Internship at Infosys.", positions: [pos("Software Engineering Intern", "Infosys", "Bengaluru, India", "Jan 2024", "Jun 2024", "Java, Python, SQL")], education: [edu("VIT University", "B.Tech", "Computer Science and Engineering")], skills: [{ Name: "Java" }, { Name: "Python" }, { Name: "SQL" }] }) },
  { name: "India: M.Tech + 2 years at TCS", degree: "master", years: [1.8, 2.3], topFamilies: TECH,
    profile: make({ permit: "orientation_year", birth: 1998, origin: "non_eu", dutch: "none", cv: "Software engineer with 2 years at TCS. Python, AWS, Docker, microservices. M.Tech Data Science.", positions: [pos("Software Engineer", "Tata Consultancy Services", "Pune, India", "Jul 2020", "Jun 2022", "Python, AWS, Docker, microservices")], education: [edu("IIT Madras", "M.Tech", "Data Science")], skills: [{ Name: "Python" }, { Name: "AWS" }, { Name: "Docker" }] }) },
  { name: "China: Master of Engineering, mechanical", degree: "master", years: [0, 0.7],
    profile: make({ permit: "orientation_year", birth: 2000, origin: "non_eu", dutch: "none", cv: "Mechanical engineer. CAD, SolidWorks, finite element analysis.", positions: [pos("Mechanical Engineering Intern", "BYD", "Shenzhen, China", "Jun 2023", "Dec 2023", "SolidWorks, CAD")], education: [edu("Tsinghua University", "Master of Engineering", "Mechanical Engineering")], skills: [{ Name: "SolidWorks" }] }) },
  { name: "Vietnam: MSc Finance, analyst", degree: "master", years: [2.2, 2.7], topFamilies: FIN,
    profile: make({ permit: "orientation_year", birth: 1999, abroad: 20, origin: "non_eu", dutch: "basic", cv: "Financial analyst. IFRS, Excel modelling, budgeting.", positions: [pos("Financial Analyst", "Vietcombank", "Hanoi, Vietnam", "Mar 2021", "Aug 2023", "Monthly reporting, Excel modelling, IFRS.")], education: [edu("Erasmus University Rotterdam", "MSc Finance")], skills: [{ Name: "Excel" }, { Name: "IFRS" }] }) },
  { name: "Nigeria: BSc Accounting + ACCA", degree: "bachelor", years: [1.8, 2.3], topFamilies: FIN,
    profile: make({ permit: "other_non_eu", birth: 1997, origin: "non_eu", dutch: "none", cv: "Accountant, ACCA. Audit, IFRS, tax, reconciliation.", positions: [pos("Audit Associate", "PwC Nigeria", "Lagos, Nigeria", "Sep 2021", "Aug 2023", "Audit, IFRS, tax")], education: [edu("University of Lagos", "BSc Accounting")], skills: [{ Name: "Audit" }, { Name: "IFRS" }] }) },
  { name: "Brazil: Bacharelado + Mestrado (Portuguese)", degree: "master", years: [0, 1.2],
    profile: make({ permit: "orientation_year", birth: 1999, origin: "non_eu", dutch: "none", cv: "Administração de empresas. Marketing digital, Excel.", positions: [pos("Estagiária de Marketing", "Natura", "São Paulo, Brasil", "Jan 2023", "Dec 2023", "Marketing digital")], education: [edu("USP", "Bacharelado em Administração"), edu("USP", "Mestrado em Administração")], skills: [{ Name: "Excel" }] }) },
  { name: "Iran: M.Sc. written with dots", degree: "master", years: [0, 2.2],
    profile: make({ permit: "orientation_year", birth: 1996, origin: "non_eu", dutch: "none", cv: "Electrical engineer. MATLAB, embedded systems.", positions: [pos("Electrical Engineer", "Siemens Iran", "Tehran, Iran", "Jan 2022", "Dec 2023", "MATLAB, embedded")], education: [edu("Sharif University", "M.Sc.", "Electrical Engineering")], skills: [{ Name: "MATLAB" }] }) },
  { name: "Turkey: Lisans + Yüksek Lisans", degree: "master", years: [0, 1.2],
    profile: make({ permit: "orientation_year", birth: 1998, origin: "non_eu", dutch: "none", cv: "Endüstri mühendisi. Supply chain, SAP, Excel.", positions: [pos("Stajyer Mühendis", "Arçelik", "İstanbul, Türkiye", "Jun 2022", "Sep 2022", "Supply chain, SAP")], education: [edu("Boğaziçi Üniversitesi", "Lisans", "Endüstri Mühendisliği"), edu("Boğaziçi Üniversitesi", "Yüksek Lisans", "Endüstri Mühendisliği")], skills: [{ Name: "SAP" }] }) },
  { name: "Germany EU citizen: Bachelor, no work", degree: "bachelor", years: [0, 0.01],
    profile: make({ permit: "eu", birth: 2002, origin: "eu_non_native", dutch: "none", cv: "Bachelor Business Administration. Marketing, Excel.", positions: [], education: [edu("LMU Munich", "Bachelor of Science", "Business Administration")], skills: [{ Name: "Excel" }] }) },
  { name: "USA: Bachelor of Arts, marketing intern", degree: "bachelor", years: [0.2, 0.4],
    profile: make({ permit: "orientation_year", birth: 2001, origin: "non_eu", dutch: "none", cv: "Marketing and communications. Social media, content, Canva.", positions: [pos("Marketing Intern", "HubSpot", "Boston, USA", "Jun 2024", "Sep 2024", "Social media, content")], education: [edu("Boston University", "Bachelor of Arts", "Communication")], skills: [{ Name: "Social Media" }] }) },
  { name: "Indonesia: PhD", degree: "phd", years: [0, 4.5],
    profile: make({ permit: "hsm", birth: 1992, origin: "non_eu", dutch: "none", cv: "PhD in materials science. Python, microscopy, data analysis.", positions: [pos("PhD Researcher", "ITB", "Bandung, Indonesia", "Sep 2018", "Aug 2022", "Materials science")], education: [edu("ITB", "Doctor of Philosophy", "Materials Science")], skills: [{ Name: "Python" }] }) },
  { name: "Poland: lists Polish and English only", degree: "master", years: [0, 1.2],
    profile: make({ permit: "eu", birth: 1999, origin: "eu_non_native", dutch: "none", languages: [{ Name: "Polish" }, { Name: "English" }], cv: "Controlling. Excel, SAP.", positions: [pos("Controlling Intern", "Orlen", "Warsaw, Poland", "Jun 2023", "Sep 2023", "Excel, SAP")], education: [edu("SGH Warsaw", "Master of Science", "Finance")], skills: [{ Name: "Excel" }] }) },
  { name: "Colombia: lists Spanish and English", degree: "bachelor", years: [0, 1.2],
    profile: make({ permit: "orientation_year", birth: 2000, origin: "non_eu", dutch: "none", languages: [{ Name: "Spanish" }, { Name: "English" }], cv: "Business.", positions: [], education: [edu("Universidad de los Andes", "Licenciatura", "Business")], skills: [] }) },
  { name: "STUDENT: master's student until next summer", degree: "master", studying: true, years: [0, 0.4], topFamilies: FIN,
    profile: make({ permit: "other_non_eu", birth: 2001, origin: "non_eu", dutch: "none", cv: "Finance student. Excel, IFRS.", positions: [], education: [{ "School Name": "Erasmus University", "Degree Name": "MSc Finance", "Start Date": `Sep ${new Date().getFullYear() - 1}`, "End Date": `Aug ${new Date().getFullYear() + 1}` }], skills: [{ Name: "Excel" }, { Name: "IFRS" }] }) },
  { name: "STUDENT: graduated two years ago, on the orientation year", degree: "master", studying: false, years: [0, 0.4], topFamilies: FIN,
    profile: make({ permit: "orientation_year", birth: 1999, origin: "non_eu", dutch: "none", cv: "Finance graduate. Excel, IFRS.", positions: [], education: [{ "School Name": "Erasmus University", "Degree Name": "MSc Finance", "Start Date": `Sep ${new Date().getFullYear() - 4}`, "End Date": `Jun ${new Date().getFullYear() - 2}` }], skills: [{ Name: "Excel" }, { Name: "IFRS" }] }) },
  { name: "STUDENT: says studying, dates say graduated", degree: "master", studying: true, years: [0, 0.4],
    profile: make({ permit: "orientation_year", birth: 1999, origin: "non_eu", dutch: "none", studying: true, cv: "Finance graduate doing a second degree.", positions: [], education: [{ "School Name": "Erasmus University", "Degree Name": "MSc Finance", "Start Date": `Sep ${new Date().getFullYear() - 4}`, "End Date": `Jun ${new Date().getFullYear() - 2}` }], skills: [{ Name: "Excel" }] }) },
  { name: "STUDENT: says not studying, dates say still studying", degree: "bachelor", studying: false, years: [0, 0.4],
    profile: make({ permit: "orientation_year", birth: 2000, origin: "non_eu", dutch: "none", studying: false, cv: "Finished early.", positions: [], education: [{ "School Name": "UvA", "Degree Name": "BSc Economics", "Start Date": `Sep ${new Date().getFullYear() - 2}`, "End Date": `Aug ${new Date().getFullYear() + 1}` }], skills: [{ Name: "Excel" }] }) },
  { name: "EDGE: Bachelor who is also a Scrum Master", degree: "bachelor", years: [0, 3],
    profile: make({ permit: "orientation_year", birth: 1999, origin: "non_eu", dutch: "none", cv: "Certified Scrum Master. Agile coach for two teams. Bachelor Information Systems.", positions: [pos("Scrum Master", "Grab", "Singapore", "Jan 2022", "Dec 2023", "Agile, scrum")], education: [edu("NUS", "Bachelor of Computing", "Information Systems")], skills: [{ Name: "Agile" }] }) },
  { name: "EDGE: Bachelor who worked with doctors", degree: "bachelor", years: [0, 3],
    profile: make({ permit: "orientation_year", birth: 1999, origin: "non_eu", dutch: "none", cv: "Medical administrator assisting doctors. Bachelor Health Management.", positions: [pos("Medical Administrator", "City Hospital", "Manila, Philippines", "Jan 2022", "Dec 2023", "Assisting doctors")], education: [edu("UP Manila", "Bachelor", "Health Management")], skills: [] }) },
  { name: "EDGE: no degree, 5 years of work", degree: "unknown", years: [4.5, 5.5],
    profile: make({ permit: "other_non_eu", birth: 1994, origin: "non_eu", dutch: "basic", cv: "Sales executive, 5 years. CRM, negotiation.", positions: [pos("Sales Executive", "Lazada", "Manila, Philippines", "Jan 2019", "Dec 2023", "CRM, negotiation")], education: [], skills: [{ Name: "CRM" }] }) },
  { name: "EDGE: 38-year-old, HSM, 14 years", degree: "master", years: [13, 15],
    profile: make({ permit: "hsm", birth: 1988, abroad: 30, origin: "non_eu", dutch: "none", cv: "Engineering manager, 14 years. Cloud, Kubernetes, leadership. MBA.", positions: [pos("Engineering Manager", "Grab", "Singapore", "Jan 2010", "Dec 2023", "Cloud, Kubernetes, leadership")], education: [edu("INSEAD", "MBA")], skills: [{ Name: "Kubernetes" }] }) },
  { name: "EDGE: dates as 03/2021, 2019-2020 and Present", degree: "bachelor", years: [6.3, 6.9],
    profile: make({ permit: "orientation_year", birth: 1999, origin: "non_eu", dutch: "none", cv: "Data analyst. SQL, Tableau.", positions: [pos("Data Analyst", "Shopee", "Singapore", "03/2021", "Present", "SQL, Tableau"), pos("Analyst", "Grab", "Singapore", "2019", "2020", "")], education: [edu("NUS", "BSc", "Statistics")], skills: [{ Name: "SQL" }] }) },
  { name: "EDGE: Sept, full month names and ISO dates", degree: "bachelor", years: [3.1, 3.4],
    profile: make({ permit: "orientation_year", birth: 2000, origin: "non_eu", dutch: "none", cv: "Analyst.", positions: [pos("Analyst", "A", "Jakarta, Indonesia", "Sept 2021", "June 2023", ""), pos("Senior Analyst", "B", "Jakarta, Indonesia", "2023-07", "2025-01", "")], education: [edu("UI", "Bachelor", "Economics")], skills: [] }) },
  { name: "EDGE: pre-master is not a master", degree: "bachelor", years: [0, 0.01],
    profile: make({ permit: "orientation_year", birth: 2000, origin: "non_eu", dutch: "none", cv: "", positions: [], education: [edu("VU Amsterdam", "Bachelor"), edu("VU Amsterdam", "Pre-Master Business Administration")], skills: [] }) },
  { name: "EDGE: unicode, emoji and RTL text", degree: "bachelor", years: [0, 10],
    profile: make({ permit: "orientation_year", birth: 2000, origin: "non_eu", dutch: "none", cv: "مهندس برمجيات 💻 软件工程师 — Python, SQL ✅", positions: [pos("مهندس برمجيات", "شركة", "القاهرة, مصر", "Jan 2022", "Dec 2023", "Python 💻")], education: [edu("جامعة القاهرة", "Bachelor", "Computer Science")], skills: [{ Name: "Python" }, { Name: "Python" }, { Name: "" }] }) },
  { name: "EDGE: absurd birth year and future dates", degree: "bachelor", years: [0, 100],
    profile: make({ permit: "orientation_year", birth: 3000, origin: "non_eu", dutch: "none", cv: "Bachelor Economics.", positions: [pos("Analyst", "X", "Y", "Jan 2040", "Dec 2020", "")], education: [edu("Z", "Bachelor")], skills: [] }) },
  { name: "EDGE: enormous CV text", degree: "bachelor", years: [0, 10],
    profile: make({ permit: "orientation_year", birth: 2000, origin: "non_eu", dutch: "none", cv: ("Bachelor Economics. Excel SQL Python. ".repeat(4000)), positions: [], education: [edu("Z", "Bachelor")], skills: [] }) },
]

