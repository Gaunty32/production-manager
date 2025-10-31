-- Production Database Setup for Select Uniforms
-- Run this in your production database console

-- Import all 29 customers
INSERT INTO customers (name, contact_first_name, contact_last_name, email, telephone, address, pricing_table_2025, pricing_table_2026) VALUES
('41 Prints', 'Dionne', 'Bamford', 'forty1prints@outlook.com', '07402 290754', NULL, false, true),
('Aspect', 'David', 'Wilton', 'david.wilton@corporateclothingwear.com', '07974225862', 'Unit 3 Hill Foot View, Aylesbury, HP22 4FS', true, false),
('Branding Inc', 'Ranjit', 'Rai', 'ranjit@brandinginc.co.uk', '01274 90 60 25', 'Bradford Chamber Business Park, New Lane, Bradford, BD4 8BX', false, true),
('Creations 4 You', 'Gemma', NULL, 'creations-4-you@hotmail.com', '07523964826', '5 Highfiled Avenue, Lincoln, LN6 7QS', false, true),
('Customised Prints', 'Adrian', NULL, 'customisedprints3@yahoo.com', '07907362273', '3 Glackmor
Tartnakilly Road 
BT49 9GA ', false, true),
('East Point Sports', 'Darrel', 'Hibbert', 'darrel@eastpointsports.net', '01502563330', '124 Bevan Street East, Lowerstoft, Suffolk, NR32 2AQ', false, true),
('East Yorkshire Worwear', 'Phil', 'Bullen', 'hello@eastyorkshireworkwear.co.uk', '07989556587', '443 Endike Lane
Hull HU6 8AG', true, false),
('Hartland Hoodies', NULL, NULL, NULL, NULL, NULL, true, false),
('Hazzad Embroidery', NULL, NULL, NULL, NULL, NULL, false, false),
('JK Prints', NULL, NULL, NULL, NULL, NULL, false, false),
('JS Branded', 'Jeremy', 'Sherburn', 'jeremy@jsa1brandedclothing.com', NULL, NULL, true, false),
('Kit Room', 'Sean', 'McCarthy', 'sean@kit-room.co.uk', '07790379038', NULL, false, true),
('Liverpool Store', NULL, NULL, NULL, NULL, NULL, false, false),
('Logo Farm', 'Colin', 'Stevenson', 'thelogofarm@outlook.com', '07895963050', 'Unit 1 Magbiehill Park, Dunlop Road, Stewarton, Kilmarnock, East Ayrshire, KA3 3ES', true, false),
('Logos On', 'Nick', 'Clelmente', 'nick.clemente@logons-on.com', NULL, 'Unit 1 Block 4 Threave Court, Castlehill Industrial Estate, Carluke, Ml8 5UF', true, false),
('Mad For It', 'Kenny', 'Johnston', 'info@madforitmerch.co.uk', NULL, '24 Albion Street
Otley LS21 1BY', false, true),
('Mantis', 'Matt', 'Peters', 'matt@mantisworld.com', '07792549747', '4 Foscote Mews, London, Westminster, W9 2HH', false, true),
('Needhams', NULL, NULL, NULL, NULL, NULL, false, false),
('PC Sports', NULL, NULL, NULL, NULL, NULL, false, false),
('PWS', NULL, NULL, NULL, NULL, NULL, false, false),
('Positive Branding', 'Jonathan', 'Wilton', 'jono@positivebranding.co.uk', '02089121515', 'The Office
59 Old Church Lane, Stanmore, Middlesex, HA7 2RG', true, false),
('Print Matters', 'Colin', NULL, 'info@printmatterskent.com', '01227765031', 'Print Matters, Unit 9, City Business Park, Marshwood Close, Unit 9, Canterbury, Kent, CT1 1DX', false, true),
('Purple Workwear', NULL, NULL, NULL, NULL, NULL, false, false),
('Rutland Merchandise', 'Sam', 'Dawson', 'sam@rutlandmerchandise.co.uk', NULL, 'Unit 3, Pullman Trading Estate, Station Road, Oakham, Rutland, LE15 9TX', true, false),
('Shirtworks', 'Andy', 'Timmins', 'accounts@shirtworks.co.uk', NULL, 'Unit 7 Ashville Way, Cowley, Oxford, OX4 6TU', true, false),
('Twenty Two Shop', 'James', 'Radford', 'info@twentytwoshop.com', NULL, '9 Commonside
Sheffield S10 1GA', true, false),
('Unifab', 'Moin', 'Qureshi', 'info@wearunifab.com', '07768320422', '608 Green Lane, Ilford, IG3 9SQ', false, true),
('WCS', NULL, NULL, NULL, NULL, NULL, false, false),
('Wearwork', NULL, NULL, NULL, NULL, NULL, false, false);

-- Verify import
SELECT COUNT(*) as customer_count FROM customers;
