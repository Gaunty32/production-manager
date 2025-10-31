import { Request, Response } from "express";
import { db } from "./db";
import { customers } from "@shared/schema";

const customerData = [
  { name: "41 Prints", contactFirstName: "Dionne", contactLastName: "Bamford", email: "forty1prints@outlook.com", telephone: "07402 290754", address: null, pricingTable2025: false, pricingTable2026: true },
  { name: "Aspect", contactFirstName: "David", contactLastName: "Wilton", email: "david.wilton@corporateclothingwear.com", telephone: "07974225862", address: "Unit 3 Hill Foot View, Aylesbury, HP22 4FS", pricingTable2025: true, pricingTable2026: false },
  { name: "Branding Inc", contactFirstName: "Ranjit", contactLastName: "Rai", email: "ranjit@brandinginc.co.uk", telephone: "01274 90 60 25", address: "Bradford Chamber Business Park, New Lane, Bradford, BD4 8BX", pricingTable2025: false, pricingTable2026: true },
  { name: "Creations 4 You", contactFirstName: "Gemma", contactLastName: null, email: "creations-4-you@hotmail.com", telephone: "07523964826", address: "5 Highfiled Avenue, Lincoln, LN6 7QS", pricingTable2025: false, pricingTable2026: true },
  { name: "Customised Prints", contactFirstName: "Adrian", contactLastName: null, email: "customisedprints3@yahoo.com", telephone: "07907362273", address: "3 Glackmor\nTartnakilly Road \nBT49 9GA \n", pricingTable2025: false, pricingTable2026: true },
  { name: "East Point Sports", contactFirstName: "Darrel", contactLastName: "Hibbert", email: "darrel@eastpointsports.net", telephone: "01502563330", address: "124 Bevan Street East, Lowerstoft, Suffolk, NR32 2AQ", pricingTable2025: false, pricingTable2026: true },
  { name: "East Yorkshire Worwear", contactFirstName: "Phil", contactLastName: "Bullen", email: "hello@eastyorkshireworkwear.co.uk", telephone: "07989556587", address: "443 Endike Lane\nHull HU6 8AG", pricingTable2025: true, pricingTable2026: false },
  { name: "Hartland Hoodies", contactFirstName: null, contactLastName: null, email: null, telephone: null, address: null, pricingTable2025: true, pricingTable2026: false },
  { name: "Hazzad Embroidery", contactFirstName: null, contactLastName: null, email: null, telephone: null, address: null, pricingTable2025: false, pricingTable2026: false },
  { name: "JK Prints", contactFirstName: null, contactLastName: null, email: null, telephone: null, address: null, pricingTable2025: false, pricingTable2026: false },
  { name: "JS Branded", contactFirstName: "Jeremy", contactLastName: "Sherburn", email: "jeremy@jsa1brandedclothing.com", telephone: null, address: null, pricingTable2025: true, pricingTable2026: false },
  { name: "Kit Room", contactFirstName: "Sean", contactLastName: "McCarthy", email: "sean@kit-room.co.uk", telephone: "07790379038", address: null, pricingTable2025: false, pricingTable2026: true },
  { name: "Liverpool Store", contactFirstName: null, contactLastName: null, email: null, telephone: null, address: null, pricingTable2025: false, pricingTable2026: false },
  { name: "Logo Farm", contactFirstName: "Colin", contactLastName: "Stevenson", email: "thelogofarm@outlook.com", telephone: "07895963050", address: "Unit 1 Magbiehill Park, Dunlop Road, Stewarton, Kilmarnock, East Ayrshire, KA3 3ES", pricingTable2025: true, pricingTable2026: false },
  { name: "Logos On", contactFirstName: "Nick", contactLastName: "Clelmente", email: "nick.clemente@logons-on.com", telephone: null, address: "Unit 1 Block 4 Threave Court, Castlehill Industrial Estate, Carluke, Ml8 5UF", pricingTable2025: true, pricingTable2026: false },
  { name: "Mad For It", contactFirstName: "Kenny", contactLastName: "Johnston", email: "info@madforitmerch.co.uk", telephone: null, address: "24 Albion Street\nOtley LS21 1BY", pricingTable2025: false, pricingTable2026: true },
  { name: "Mantis", contactFirstName: "Matt", contactLastName: "Peters", email: "matt@mantisworld.com", telephone: "07792549747", address: "4 Foscote Mews, London, Westminster, W9 2HH", pricingTable2025: false, pricingTable2026: true },
  { name: "Needhams", contactFirstName: null, contactLastName: null, email: null, telephone: null, address: null, pricingTable2025: false, pricingTable2026: false },
  { name: "PC Sports", contactFirstName: null, contactLastName: null, email: null, telephone: null, address: null, pricingTable2025: false, pricingTable2026: false },
  { name: "PWS", contactFirstName: null, contactLastName: null, email: null, telephone: null, address: null, pricingTable2025: false, pricingTable2026: false },
  { name: "Positive Branding", contactFirstName: "Jonathan", contactLastName: "Wilton", email: "jono@positivebranding.co.uk", telephone: "02089121515", address: "The Office\n59 Old Church Lane, Stanmore, Middlesex, HA7 2RG", pricingTable2025: true, pricingTable2026: false },
  { name: "Print Matters", contactFirstName: "Colin", contactLastName: null, email: "info@printmatterskent.com", telephone: "01227765031", address: "Print Matters, Unit 9, City Business Park, Marshwood Close, Unit 9, Canterbury, Kent, CT1 1DX", pricingTable2025: false, pricingTable2026: true },
  { name: "Purple Workwear", contactFirstName: null, contactLastName: null, email: null, telephone: null, address: null, pricingTable2025: false, pricingTable2026: false },
  { name: "Rutland Merchandise", contactFirstName: "Sam", contactLastName: "Dawson", email: "sam@rutlandmerchandise.co.uk", telephone: null, address: "Unit 3, Pullman Trading Estate, Station Road, Oakham, Rutland, LE15 9TX", pricingTable2025: true, pricingTable2026: false },
  { name: "Shirtworks", contactFirstName: "Andy", contactLastName: "Timmins", email: "accounts@shirtworks.co.uk", telephone: null, address: "Unit 7 Ashville Way, Cowley, Oxford, OX4 6TU", pricingTable2025: true, pricingTable2026: false },
  { name: "Twenty Two Shop", contactFirstName: "James", contactLastName: "Radford", email: "info@twentytwoshop.com", telephone: null, address: "9 Commonside\nSheffield S10 1GA", pricingTable2025: true, pricingTable2026: false },
  { name: "Unifab", contactFirstName: "Moin", contactLastName: "Qureshi", email: "info@wearunifab.com", telephone: "07768320422", address: "608 Green Lane, Ilford, IG3 9SQ", pricingTable2025: false, pricingTable2026: true },
  { name: "WCS", contactFirstName: null, contactLastName: null, email: null, telephone: null, address: null, pricingTable2025: false, pricingTable2026: false },
  { name: "Wearwork", contactFirstName: null, contactLastName: null, email: null, telephone: null, address: null, pricingTable2025: false, pricingTable2026: false }
];

export async function setupProductionDatabase(req: Request, res: Response) {
  try {
    // Check if customers already exist
    const existingCustomers = await db.select().from(customers);
    
    if (existingCustomers.length > 0) {
      return res.status(200).json({
        success: true,
        message: "Database already set up!",
        customersCount: existingCustomers.length,
        alreadySetup: true
      });
    }

    // Import all customers
    for (const customer of customerData) {
      await db.insert(customers).values(customer);
    }

    return res.status(200).json({
      success: true,
      message: "Production database setup complete!",
      customersImported: customerData.length,
      alreadySetup: false
    });

  } catch (error: any) {
    console.error("Setup error:", error);
    return res.status(500).json({
      success: false,
      message: "Error setting up database",
      error: error.message
    });
  }
}
