"""Seed the e-commerce SQLite database for Datagentra.

15 tables, ~500 users, ~3500 orders, ~7000 order items.
Designed for complex analytical SQL queries.
"""
from __future__ import annotations
import os, random, sqlite3
from datetime import datetime, timedelta

random.seed(42)

DB_PATH = os.getenv("SQLITE_DB_PATH", os.path.join(os.path.dirname(__file__), "datagentra.db"))

START = datetime(2022, 1, 1)
END   = datetime(2024, 12, 31)

def rdt(start=START, end=END):
    return start + timedelta(days=random.randint(0, (end-start).days),
                             hours=random.randint(0,23), minutes=random.randint(0,59))
def fmt(dt): return dt.strftime("%Y-%m-%d %H:%M:%S")
def rfmt(s=START, e=END): return fmt(rdt(s, e))
def wc(items, weights): return random.choices(items, weights=weights, k=1)[0]

# ── Static data ───────────────────────────────────────────────────────────────

FIRST_M = ["James","John","Robert","Michael","William","David","Richard","Joseph",
           "Thomas","Charles","Christopher","Daniel","Matthew","Anthony","Mark",
           "Donald","Steven","Paul","Andrew","Joshua","Kevin","Brian","George","Timothy","Ronald"]
FIRST_F = ["Mary","Patricia","Jennifer","Linda","Barbara","Elizabeth","Susan","Jessica",
           "Sarah","Karen","Lisa","Nancy","Betty","Margaret","Sandra","Ashley",
           "Dorothy","Kimberly","Emily","Donna","Michelle","Carol","Amanda","Melissa","Deborah"]
LAST    = ["Smith","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis",
           "Rodriguez","Martinez","Hernandez","Lopez","Gonzalez","Wilson","Anderson",
           "Thomas","Taylor","Moore","Jackson","Martin","Lee","Perez","Thompson","White",
           "Harris","Sanchez","Clark","Ramirez","Lewis","Robinson","Walker","Young",
           "Allen","King","Wright","Scott","Torres","Nguyen","Hill","Flores","Green",
           "Adams","Nelson","Baker","Hall","Rivera","Campbell","Mitchell","Carter","Roberts"]

CITIES = {
    "USA":       [("New York","NY"),("Los Angeles","CA"),("Chicago","IL"),("Houston","TX"),
                  ("Phoenix","AZ"),("Philadelphia","PA"),("San Antonio","TX"),("San Diego","CA"),
                  ("Dallas","TX"),("San Jose","CA"),("Austin","TX"),("Seattle","WA"),
                  ("Denver","CO"),("Boston","MA"),("Las Vegas","NV"),("Nashville","TN")],
    "UK":        [("London","ENG"),("Manchester","ENG"),("Birmingham","ENG"),("Leeds","ENG"),
                  ("Glasgow","SCO"),("Liverpool","ENG"),("Bristol","ENG"),("Edinburgh","SCO")],
    "Canada":    [("Toronto","ON"),("Montreal","QC"),("Vancouver","BC"),("Calgary","AB"),
                  ("Ottawa","ON"),("Edmonton","AB"),("Winnipeg","MB"),("Halifax","NS")],
    "Germany":   [("Berlin","BE"),("Hamburg","HH"),("Munich","BY"),("Cologne","NW"),
                  ("Frankfurt","HE"),("Stuttgart","BW"),("Düsseldorf","NW"),("Leipzig","SN")],
    "Australia": [("Sydney","NSW"),("Melbourne","VIC"),("Brisbane","QLD"),("Perth","WA"),
                  ("Adelaide","SA"),("Canberra","ACT"),("Hobart","TAS"),("Darwin","NT")],
    "France":    [("Paris","IDF"),("Lyon","ARA"),("Marseille","PAC"),("Bordeaux","NAQ")],
    "Netherlands":[("Amsterdam","NH"),("Rotterdam","ZH"),("Utrecht","UT"),("The Hague","ZH")],
    "Spain":     [("Madrid","MD"),("Barcelona","CT"),("Valencia","VC"),("Seville","AN")],
}
COUNTRY_W = ["USA"]*50+["UK"]*15+["Canada"]*10+["Germany"]*10+["Australia"]*7+["France"]*4+["Netherlands"]*2+["Spain"]*2
GENDERS   = ["M"]*48+["F"]*48+["Other"]*4
SEGMENTS  = ["VIP"]*5+["Regular"]*45+["New"]*20+["At-risk"]*15+["Churned"]*15
PAYMENTS  = ["credit_card"]*45+["paypal"]*25+["bank_transfer"]*15+["debit_card"]*10+["crypto"]*5
RETURN_REASONS = ["defective","not_as_described","changed_mind","wrong_item","arrived_damaged"]
REVIEW_TITLES  = {
    5:["Absolutely love it!","Perfect product","Exceeded expectations","Best purchase ever","Five stars"],
    4:["Really good","Happy with this","Works well","Solid product","Recommended"],
    3:["Decent but not perfect","Average quality","It's okay","Does the job","Mixed feelings"],
    2:["Disappointed","Not what I expected","Poor quality","Would not recommend","Issues with product"],
    1:["Terrible","Complete waste of money","Do not buy","Broken on arrival","Worst purchase"],
}
REVIEW_BODIES = {
    5:["Great quality and fast shipping. Exactly as described.",
       "Highly recommend this to anyone. Works perfectly out of the box.",
       "Surprised by the quality at this price point.",
       "Already bought two more as gifts. Everyone loved them."],
    4:["Good product overall. Minor packaging issue but product is fine.",
       "Works as expected. Delivery was fast.",
       "Good value for money. Would buy again.",
       "Happy with the purchase. Meets all my needs."],
    3:["Average quality. Not bad but not great.",
       "Does the job but nothing special.",
       "OK product. Had slight issues but nothing major.",
       "Middle of the road. Expected a bit more."],
    2:["Quality is below expectations. Had to return one item.",
       "Not as described. Disappointed with this purchase.",
       "Would not recommend. Cheaper alternatives are better."],
    1:["Product stopped working after 2 days. Very disappointed.",
       "Complete waste of money. Nothing like the photos.",
       "Arrived broken. Customer service was unhelpful."],
}

# ── Products: (name, cat_id, brand_id, price, cost, stock, weight_kg, description) ─

PRODUCTS_DATA = [
    # Smartphones & Tablets (cat 2)
    ("TechVision Apex 15 Pro",       2,1, 899.99,395.00,150,0.19,"Flagship 200MP 5G smartphone"),
    ("TechVision Apex 15",           2,1, 699.99,290.00,200,0.18,"Premium AMOLED smartphone"),
    ("TechVision Apex 14 SE",        2,1, 499.99,195.00,220,0.17,"Mid-range 5G smartphone"),
    ("NovaMobile S23 Ultra",         2,2, 849.99,370.00,120,0.23,"S-Pen flagship 100x zoom"),
    ("NovaMobile A54 Plus",          2,2, 399.99,155.00,300,0.19,"Long-battery mid-range phone"),
    ("NovaMobile A34",               2,2, 299.99,110.00,350,0.19,"Budget 5G smartphone"),
    ("TechVision Tab Pro 12",        2,1, 599.99,240.00, 80,0.52,"12-inch tablet with stylus"),
    ("NovaMobile Tab S8+",           2,2, 649.99,265.00, 90,0.49,"OLED professional tablet"),
    ("TechVision Watch Series 9",    2,1, 399.99,140.00,180,0.04,"Health monitoring smartwatch"),
    ("TechVision Buds Pro 2",        2,1, 229.99, 72.00,350,0.06,"Noise-cancelling wireless earbuds"),
    # Computers & Laptops (cat 3)
    ("TechVision UltraBook Pro 14",  3,1,1299.99,570.00, 60,1.35,"i7 16GB ultra-thin laptop"),
    ("TechVision UltraBook Air 13",  3,1, 999.99,420.00, 75,1.24,"Lightweight 13-inch laptop"),
    ("TechVision UltraBook 15 i5",   3,1, 799.99,330.00, 85,1.62,"Core i5 everyday laptop"),
    ("NovaMobile ChromeBook Plus",   3,2, 499.99,195.00,100,1.42,"Cloud laptop for everyday use"),
    ("TechVision Desktop Tower X",   3,1,1099.99,480.00, 40,6.80,"RTX 4070 gaming desktop"),
    ("TechVision Monitor 27\" 4K",   3,1, 549.99,215.00, 55,4.90,"27-inch 4K IPS monitor"),
    ("TechVision Monitor 32\" QHD",  3,1, 449.99,175.00, 65,5.20,"32-inch curved 1440p monitor"),
    ("TechVision Mechanical KB Pro", 3,1, 129.99, 38.00,200,0.95,"RGB mechanical keyboard"),
    ("TechVision Wireless Mouse Pro",3,1,  79.99, 22.00,300,0.12,"4000 DPI ergonomic mouse"),
    ("TechVision Webcam 4K",         3,1, 149.99, 45.00,150,0.18,"4K webcam with ring light"),
    ("TechVision USB-C Hub 10in1",   3,1,  89.99, 24.00,250,0.22,"10-in-1 USB-C docking station"),
    ("TechVision SSD 1TB Portable",  3,1,  99.99, 32.00,200,0.08,"USB 3.2 portable SSD 1TB"),
    # Clothing & Apparel (cat 4)
    ("EcoStyle Classic Tee",         4,10, 29.99,  8.50,500,0.20,"Organic cotton basic t-shirt"),
    ("EcoStyle Premium Hoodie",      4,10, 69.99, 22.00,300,0.55,"Heavyweight fleece hoodie"),
    ("EcoStyle Slim Chinos",         4,10, 59.99, 18.00,250,0.45,"Stretch chino work pants"),
    ("EcoStyle Yoga Leggings",       4,10, 49.99, 14.00,400,0.22,"High-waist compression leggings"),
    ("EcoStyle Running Shorts",      4,10, 34.99,  9.50,350,0.18,"Lightweight 5-inch running shorts"),
    ("EcoStyle Winter Jacket",       4,10,149.99, 52.00,120,0.85,"Insulated puffer jacket"),
    ("EcoStyle Linen Dress",         4,10, 79.99, 24.00,180,0.35,"Summer linen midi dress"),
    ("EcoStyle Canvas Sneakers",     4,10, 69.99, 21.00,200,0.60,"Classic canvas low-top sneakers"),
    ("EcoStyle Wool Beanie",         4,10, 24.99,  6.50,400,0.08,"Merino wool winter beanie"),
    ("EcoStyle Leather Belt",        4,10, 39.99, 10.50,300,0.25,"Genuine leather dress belt"),
    ("ApexFit Pro Running Shoes",    4, 3,119.99, 42.00,150,0.65,"Carbon-plated road racing shoes"),
    ("ApexFit Trail Runners",        4, 3, 99.99, 34.00,130,0.68,"All-terrain trail running shoes"),
    # Home & Kitchen (cat 5)
    ("CasaLux Chef's Knife Set",     5, 4, 89.99, 28.00, 90,1.20,"5-piece professional knife set"),
    ("CasaLux Cast Iron Skillet 12\"",5,4, 59.99, 18.50, 80,2.70,"Pre-seasoned cast iron pan"),
    ("CasaLux Air Fryer 5.8L",       5, 4,129.99, 45.00,120,4.10,"Digital air fryer 8 presets"),
    ("CasaLux Coffee Maker Pro",     5, 4, 79.99, 25.00,100,1.85,"12-cup programmable coffee maker"),
    ("CasaLux Stand Mixer 7qt",      5, 4,249.99, 88.00, 50,5.90,"Professional 10-speed stand mixer"),
    ("CasaLux Bamboo Cutting Board", 5, 4, 34.99,  9.00,200,0.95,"Extra-large eco-friendly board"),
    ("CasaLux Ceramic Cookware Set", 5, 4,199.99, 68.00, 60,3.20,"10-piece non-stick ceramic set"),
    ("CasaLux Instant Pot Duo 8qt",  5, 4,129.99, 44.00, 75,4.60,"7-in-1 electric pressure cooker"),
    ("CasaLux Linen Duvet Set",      5, 4, 89.99, 28.00,100,1.40,"King luxury linen duvet set"),
    ("CasaLux Memory Foam Pillow",   5, 4, 49.99, 13.50,200,0.75,"Cooling gel memory foam pillow"),
    ("CasaLux Aromatherapy Diffuser",5, 4, 44.99, 12.00,150,0.55,"Ultrasonic essential oil diffuser"),
    ("CasaLux Robot Vacuum V3",      5, 4,299.99,112.00, 45,2.80,"Smart mapping robot vacuum"),
    ("CasaLux Electric Kettle 1.7L", 5, 4, 49.99, 14.00,180,0.95,"Temperature-control electric kettle"),
    ("CasaLux Blender Pro 1200W",    5, 4, 89.99, 27.00, 95,1.85,"High-power personal blender"),
    # Sports & Outdoors (cat 6)
    ("ApexFit Resistance Band Set",  6, 3, 29.99,  7.50,400,0.35,"5-band 10-50lb resistance set"),
    ("ApexFit Adjustable Dumbbells", 6, 3,219.99, 78.00, 60,8.20,"5-52.5lb adjustable dumbbell pair"),
    ("ApexFit Yoga Mat Pro",         6, 3, 49.99, 13.00,250,0.90,"6mm non-slip TPE yoga mat"),
    ("ApexFit Pull-Up Bar Door",     6, 3, 39.99, 10.50,180,1.15,"No-screw doorframe pull-up bar"),
    ("ApexFit Jump Rope Speed",      6, 3, 19.99,  4.50,300,0.18,"Ball-bearing speed jump rope"),
    ("SportPeak 40L Hiking Backpack",6, 9, 89.99, 28.00,120,1.20,"Waterproof trekking backpack"),
    ("SportPeak Trekking Poles",     6, 9, 59.99, 17.00, 90,0.55,"Carbon fiber collapsible poles"),
    ("SportPeak Sleeping Bag -10C",  6, 9, 79.99, 24.00, 75,1.10,"Mummy sleeping bag -10°C rated"),
    ("SportPeak Inflatable Kayak 2P",6, 9,349.99,128.00, 30,5.80,"2-person inflatable kayak"),
    ("SportPeak Camping Stove Pro",  6, 9, 69.99, 20.00, 85,0.65,"Portable 3-burner propane stove"),
    ("ApexFit Foam Roller 36\"",     6, 3, 34.99,  8.50,200,0.80,"Extra-firm deep tissue roller"),
    ("ApexFit Sports Water Bottle",  6, 3, 29.99,  7.00,350,0.22,"32oz insulated steel bottle"),
    ("ApexFit Gym Gloves Pro",       6, 3, 24.99,  6.00,300,0.18,"Anti-slip weight lifting gloves"),
    # Books & Media (cat 7)
    ("ReadWorld Python Mastery",     7, 5, 49.99,  8.00,200,0.55,"Complete Python guide 3rd ed."),
    ("ReadWorld Data Science Handbook",7,5,54.99,  9.00,180,0.60,"Comprehensive data science ref."),
    ("ReadWorld SQL for Analytics",  7, 5, 39.99,  6.50,150,0.48,"Advanced SQL for data analysis"),
    ("ReadWorld The Lean Startup",   7, 5, 24.99,  4.00,300,0.35,"Build successful businesses"),
    ("ReadWorld Atomic Habits",      7, 5, 19.99,  3.50,400,0.30,"Tiny changes, remarkable results"),
    ("ReadWorld Deep Work",          7, 5, 17.99,  3.00,350,0.28,"Focused success in distracted world"),
    ("ReadWorld Zero to One",        7, 5, 22.99,  4.00,280,0.32,"How to build the future"),
    ("ReadWorld Machine Learning A-Z",7,5, 54.99,  9.50,160,0.62,"Practical ML with Python & R"),
    ("ReadWorld Course Bundle 12mo", 7, 5,149.99, 15.00,999,0.01,"12 months, 500+ video courses"),
    ("ReadWorld Audiobook Membership",7,5, 14.99,  2.00,999,0.01,"Monthly audiobook subscription"),
    # Beauty & Health (cat 8)
    ("GlowBeauty Vitamin C Serum",   8, 6, 45.99, 11.00,250,0.08,"20% vitamin C brightening serum"),
    ("GlowBeauty Retinol Night Cream",8,6, 52.99, 13.00,200,0.09,"Anti-aging retinol moisturizer"),
    ("GlowBeauty SPF 50 Sunscreen",  8, 6, 28.99,  6.50,350,0.10,"Lightweight tinted SPF 50"),
    ("GlowBeauty Hyaluronic Toner",  8, 6, 34.99,  8.00,300,0.12,"3-layer hyaluronic toner"),
    ("GlowBeauty Jade Roller Set",   8, 6, 24.99,  5.50,400,0.15,"Jade roller and gua sha set"),
    ("GlowBeauty Collagen Peptides", 8, 6, 44.99, 10.00,180,0.45,"Grass-fed collagen powder 300g"),
    ("GlowBeauty Biotin Gummies",    8, 6, 22.99,  4.50,250,0.22,"High-potency biotin for hair"),
    ("GlowBeauty Omega-3 Fish Oil",  8, 6, 19.99,  4.00,300,0.28,"Triple-strength omega-3 180ct"),
    ("GlowBeauty Vitamin D3+K2",     8, 6, 18.99,  3.50,350,0.12,"D3 5000IU + K2 supplement"),
    ("GlowBeauty Magnesium Glycinate",8,6, 24.99,  5.00,280,0.25,"Highly bioavailable Mg 400mg"),
    ("GlowBeauty Probiotic 50B",     8, 6, 34.99,  7.50,220,0.18,"50B CFU multi-strain probiotic"),
    ("GlowBeauty Bamboo Brush Set",  8, 6, 19.99,  4.00,300,0.18,"6-piece eco bamboo makeup brushes"),
    # Toys & Games (cat 9)
    ("KidZone LEGO City Set 1200pcs",9, 7, 89.99, 32.00,100,1.45,"City police station building set"),
    ("KidZone RC Monster Truck",     9, 7, 49.99, 14.00,150,0.85,"1:16 remote control off-road truck"),
    ("KidZone Catan Board Game",     9, 7, 44.99, 12.00,180,1.10,"Classic strategy game"),
    ("KidZone Chess Set Marble",     9, 7, 59.99, 16.00,120,1.35,"Weighted marble chess set"),
    ("KidZone Card Game Bundle",     9, 7, 24.99,  6.00,200,0.45,"5 family party card games"),
    ("KidZone Puzzle 2000pcs",       9, 7, 34.99,  8.00,160,0.75,"Landscape jigsaw puzzle"),
    ("KidZone Drone Mini HD",        9, 7,129.99, 45.00, 80,0.24,"Mini FPV drone with 4K camera"),
    ("KidZone Science Kit Advanced", 9, 7, 49.99, 13.00,120,0.65,"150-experiment kit ages 8+"),
    ("KidZone Drawing Tablet Kids",  9, 7, 39.99, 10.00,150,0.55,"Digital drawing tablet with stylus"),
    # Automotive (cat 10)
    ("AutoPro Dash Cam Dual 4K",    10, 8,149.99, 52.00,120,0.28,"Front+rear 4K dash camera"),
    ("AutoPro Car Jump Starter 2000A",10,8, 89.99, 28.00, 90,0.95,"Portable lithium jump starter"),
    ("AutoPro Tire Inflator Digital",10,8, 59.99, 16.00,150,0.62,"Digital cordless tire inflator"),
    ("AutoPro Car Vacuum 120W",     10, 8, 45.99, 11.50,180,0.48,"Powerful portable car vacuum"),
    ("AutoPro Seat Cover Set",      10, 8, 69.99, 20.00,100,1.85,"9-piece universal seat covers"),
    ("AutoPro Phone Mount Wireless",10, 8, 39.99,  9.50,200,0.18,"Wireless charging car mount"),
    ("AutoPro OBD2 Scanner Pro",    10, 8, 99.99, 32.00, 75,0.22,"Bluetooth OBD2 diagnostic scanner"),
    ("AutoPro Car Wax Kit Pro",     10, 8, 34.99,  8.00,200,0.65,"7-step professional detailing kit"),
    # Food & Groceries (cat 11)
    ("EcoStyle Organic Coffee 1kg", 11,10, 24.99,  8.00,300,1.05,"Single-origin arabica whole bean"),
    ("EcoStyle Matcha Powder 100g", 11,10, 29.99,  7.50,250,0.12,"Ceremonial grade Japanese matcha"),
    ("EcoStyle Protein Powder 2lb", 11,10, 44.99, 12.00,200,0.95,"Whey isolate chocolate flavor"),
    ("EcoStyle Granola Mix 1kg",    11,10, 19.99,  5.50,300,1.02,"Organic honey and oat granola"),
    ("EcoStyle Nut Butter Variety", 11,10, 34.99,  9.00,250,0.85,"Almond, cashew, peanut 3-pack"),
    ("EcoStyle Green Tea 100 bags", 11,10, 14.99,  3.50,400,0.22,"Premium Japanese green tea"),
    ("EcoStyle Dark Chocolate 85%", 11,10, 12.99,  3.00,500,0.18,"Single-origin dark chocolate 5pk"),
    ("EcoStyle Himalayan Salt 1kg", 11,10,  9.99,  2.00,400,1.05,"Fine pink Himalayan salt"),
    # Office Supplies (cat 12)
    ("ReadWorld Wireless Presenter", 12,5, 49.99, 13.00,150,0.12,"Presentation clicker with laser"),
    ("ReadWorld Desk Organizer Set", 12,5, 34.99,  8.50,200,0.85,"5-piece bamboo desk organizer"),
    ("TechVision Noise-Cancel Headset",12,1,129.99,45.00,120,0.32,"Business noise-cancelling headset"),
    ("TechVision HD Webcam 1080p",  12, 1, 69.99, 20.00,180,0.22,"Plug-and-play 1080p webcam"),
    ("ReadWorld Planner A5 2025",   12, 5, 24.99,  5.50,300,0.28,"Yearly planner with goal tracking"),
    ("ReadWorld Sticky Notes Value",12, 5, 14.99,  3.00,400,0.35,"1200-sheet assorted sticky notes"),
    ("TechVision Label Maker Pro",  12, 1, 59.99, 16.00,130,0.38,"Thermal label maker QWERTY"),
    # Garden & Outdoor (cat 13)
    ("EcoStyle Garden Tool Set 9pc",13,10, 59.99, 17.00,100,1.45,"Stainless steel garden tools"),
    ("EcoStyle Raised Bed Planter", 13,10, 79.99, 24.00, 60,3.20,"Cedar raised garden bed 4x4ft"),
    ("EcoStyle Compost Bin 120L",   13,10, 49.99, 13.00, 75,2.85,"Outdoor composting bin"),
    ("SportPeak Camping Hammock 2P",13, 9, 59.99, 16.00,100,0.85,"Double parachute nylon hammock"),
    ("SportPeak Solar Garden Lights",13,9, 39.99,  9.50,150,0.75,"12-pack solar LED path lights"),
    ("EcoStyle Drip Irrigation Kit",13,10, 49.99, 13.50, 80,0.95,"Automatic drip system 50-plants"),
    ("EcoStyle Hummingbird Feeder", 13,10, 22.99,  5.50,200,0.35,"Glass feeder with ant moat"),
    ("SportPeak Folding Camp Chair",13, 9, 44.99, 11.00,120,1.10,"Lightweight aluminium camp chair"),
]

DEPT_ROLES = {
    "Sales":            ["Sales Manager","Senior Sales Rep","Sales Representative","Account Executive"],
    "Customer Support": ["Support Manager","Senior Support Agent","Support Agent"],
    "Marketing":        ["Marketing Manager","Marketing Specialist","Content Creator"],
    "Operations":       ["Operations Manager","Logistics Coordinator"],
    "Management":       ["CEO","CTO"],
}

CAMPAIGN_NAMES = [
    "Black Friday Blowout","Cyber Monday Deals","Summer Sale 2022","Back to School 2022",
    "Holiday Season 2022","New Year New You 2023","Valentine's Day Special","Spring Refresh 2023",
    "Mid-Year Clearance","Back to School 2023","Fall Collection 2023","Black Friday 2023",
    "Holiday Season 2023","New Year Sale 2024","Valentine's Day 2024","Spring Sale 2024",
    "Summer Kickoff 2024","Prime Day Rival 2024","Back to School 2024","Black Friday 2024",
]
CAMPAIGN_CHANNELS = ["email","social_media","paid_search","influencer","affiliate","display_ads"]


def seed(db_path: str) -> None:
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    c = conn.cursor()

    # ── Schema ────────────────────────────────────────────────────────────────
    c.executescript("""
    CREATE TABLE IF NOT EXISTS categories (
        id          INTEGER PRIMARY KEY,
        name        TEXT NOT NULL UNIQUE,
        description TEXT,
        parent_id   INTEGER REFERENCES categories(id),
        created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS brands (
        id         INTEGER PRIMARY KEY,
        name       TEXT NOT NULL UNIQUE,
        country    TEXT,
        website    TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS suppliers (
        id         INTEGER PRIMARY KEY,
        name       TEXT NOT NULL,
        email      TEXT UNIQUE,
        phone      TEXT,
        country    TEXT,
        city       TEXT,
        lead_days  INTEGER DEFAULT 7,
        rating     REAL DEFAULT 4.0,
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
        id           INTEGER PRIMARY KEY,
        category_id  INTEGER REFERENCES categories(id),
        brand_id     INTEGER REFERENCES brands(id),
        name         TEXT NOT NULL,
        description  TEXT,
        sku          TEXT UNIQUE NOT NULL,
        price        REAL NOT NULL CHECK (price >= 0),
        cost_price   REAL NOT NULL CHECK (cost_price >= 0),
        stock        INTEGER NOT NULL DEFAULT 0,
        weight_kg    REAL,
        rating_avg   REAL DEFAULT 0,
        rating_count INTEGER DEFAULT 0,
        is_active    INTEGER DEFAULT 1,
        created_at   TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS product_suppliers (
        product_id   INTEGER NOT NULL REFERENCES products(id),
        supplier_id  INTEGER NOT NULL REFERENCES suppliers(id),
        supply_price REAL,
        is_primary   INTEGER DEFAULT 0,
        PRIMARY KEY (product_id, supplier_id)
    );

    CREATE TABLE IF NOT EXISTS users (
        id         INTEGER PRIMARY KEY,
        name       TEXT NOT NULL,
        email      TEXT NOT NULL UNIQUE,
        phone      TEXT,
        city       TEXT,
        state      TEXT,
        country    TEXT DEFAULT 'USA',
        birth_year INTEGER,
        gender     TEXT,
        segment    TEXT DEFAULT 'New',
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS addresses (
        id          INTEGER PRIMARY KEY,
        user_id     INTEGER NOT NULL REFERENCES users(id),
        label       TEXT DEFAULT 'Home',
        street      TEXT,
        city        TEXT,
        state       TEXT,
        country     TEXT,
        postal_code TEXT,
        is_default  INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS employees (
        id         INTEGER PRIMARY KEY,
        name       TEXT NOT NULL,
        email      TEXT NOT NULL UNIQUE,
        department TEXT NOT NULL,
        role       TEXT NOT NULL,
        hire_date  TEXT,
        salary     REAL,
        manager_id INTEGER REFERENCES employees(id)
    );

    CREATE TABLE IF NOT EXISTS discount_codes (
        id               INTEGER PRIMARY KEY,
        code             TEXT NOT NULL UNIQUE,
        discount_type    TEXT NOT NULL CHECK (discount_type IN ('pct','fixed')),
        discount_value   REAL NOT NULL,
        min_order_value  REAL DEFAULT 0,
        max_uses         INTEGER DEFAULT 100,
        uses_count       INTEGER DEFAULT 0,
        valid_from       TEXT,
        valid_until      TEXT,
        is_active        INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS campaigns (
        id             INTEGER PRIMARY KEY,
        name           TEXT NOT NULL,
        channel        TEXT,
        budget         REAL,
        spend          REAL DEFAULT 0,
        start_date     TEXT,
        end_date       TEXT,
        target_segment TEXT
    );

    CREATE TABLE IF NOT EXISTS orders (
        id                  INTEGER PRIMARY KEY,
        user_id             INTEGER NOT NULL REFERENCES users(id),
        employee_id         INTEGER REFERENCES employees(id),
        discount_code_id    INTEGER REFERENCES discount_codes(id),
        campaign_id         INTEGER REFERENCES campaigns(id),
        shipping_address_id INTEGER REFERENCES addresses(id),
        status              TEXT NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','processing','shipped','delivered','cancelled')),
        subtotal            REAL NOT NULL DEFAULT 0,
        discount_amount     REAL DEFAULT 0,
        shipping_cost       REAL DEFAULT 0,
        total_amount        REAL NOT NULL DEFAULT 0,
        payment_method      TEXT,
        created_at          TEXT DEFAULT (datetime('now')),
        shipped_at          TEXT,
        delivered_at        TEXT,
        cancelled_at        TEXT
    );

    CREATE TABLE IF NOT EXISTS order_items (
        id           INTEGER PRIMARY KEY,
        order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id   INTEGER NOT NULL REFERENCES products(id),
        quantity     INTEGER NOT NULL CHECK (quantity > 0),
        unit_price   REAL NOT NULL,
        discount_pct REAL DEFAULT 0,
        subtotal     REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reviews (
        id            INTEGER PRIMARY KEY,
        product_id    INTEGER NOT NULL REFERENCES products(id),
        user_id       INTEGER NOT NULL REFERENCES users(id),
        order_id      INTEGER NOT NULL REFERENCES orders(id),
        rating        INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
        title         TEXT,
        body          TEXT,
        helpful_votes INTEGER DEFAULT 0,
        is_verified   INTEGER DEFAULT 1,
        created_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS returns (
        id            INTEGER PRIMARY KEY,
        order_id      INTEGER NOT NULL REFERENCES orders(id),
        order_item_id INTEGER NOT NULL REFERENCES order_items(id),
        reason        TEXT,
        status        TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','refunded')),
        refund_amount REAL DEFAULT 0,
        created_at    TEXT DEFAULT (datetime('now')),
        resolved_at   TEXT
    );

    CREATE TABLE IF NOT EXISTS inventory_log (
        id         INTEGER PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES products(id),
        change_qty INTEGER NOT NULL,
        reason     TEXT,
        reference_id INTEGER,
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_products_cat    ON products(category_id);
    CREATE INDEX IF NOT EXISTS idx_products_brand  ON products(brand_id);
    CREATE INDEX IF NOT EXISTS idx_orders_user     ON orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status   ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_created  ON orders(created_at);
    CREATE INDEX IF NOT EXISTS idx_oi_order        ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_oi_product      ON order_items(product_id);
    CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);
    CREATE INDEX IF NOT EXISTS idx_returns_order   ON returns(order_id);
    CREATE INDEX IF NOT EXISTS idx_inv_product     ON inventory_log(product_id);
    """)

    # ── Categories ────────────────────────────────────────────────────────────
    c.executemany("INSERT OR IGNORE INTO categories(id,name,description,parent_id) VALUES(?,?,?,?)", [
        (1,  "Electronics",         "Gadgets, devices and tech accessories",       None),
        (2,  "Smartphones & Tablets","Mobile phones, tablets and wearables",       1),
        (3,  "Computers & Laptops", "Laptops, desktops, monitors and peripherals", 1),
        (4,  "Clothing & Apparel",  "Men and women fashion and footwear",          None),
        (5,  "Home & Kitchen",      "Cookware, appliances and home essentials",    None),
        (6,  "Sports & Outdoors",   "Fitness equipment and outdoor gear",          None),
        (7,  "Books & Media",       "Books, e-learning and digital media",         None),
        (8,  "Beauty & Health",     "Skincare, supplements and wellness",          None),
        (9,  "Toys & Games",        "Board games, RC toys and educational kits",   None),
        (10, "Automotive",          "Car accessories, tools and detailing",        None),
        (11, "Food & Groceries",    "Specialty foods, beverages and supplements",  None),
        (12, "Office Supplies",     "Stationery, equipment and organizers",        None),
        (13, "Garden & Outdoor",    "Gardening tools, planters and outdoor decor", None),
    ])

    # ── Brands ────────────────────────────────────────────────────────────────
    c.executemany("INSERT OR IGNORE INTO brands(id,name,country,website) VALUES(?,?,?,?)", [
        (1,  "TechVision",    "USA",         "techvision.com"),
        (2,  "NovaMobile",    "South Korea", "novamobile.kr"),
        (3,  "ApexFit",       "Germany",     "apexfit.de"),
        (4,  "CasaLux",       "Italy",       "casalux.it"),
        (5,  "ReadWorld",     "UK",          "readworld.co.uk"),
        (6,  "GlowBeauty",    "France",      "glowbeauty.fr"),
        (7,  "KidZone",       "Japan",       "kidzone.jp"),
        (8,  "AutoPro",       "USA",         "autopro.com"),
        (9,  "SportPeak",     "USA",         "sportpeak.com"),
        (10, "EcoStyle",      "Netherlands", "ecostyle.nl"),
    ])

    # ── Suppliers ─────────────────────────────────────────────────────────────
    c.executemany("INSERT OR IGNORE INTO suppliers(id,name,email,phone,country,city,lead_days,rating) VALUES(?,?,?,?,?,?,?,?)", [
        (1,  "Shenzhen Tech Parts Co.",    "orders@sztechparts.cn",   "+86-755-8899001", "China",     "Shenzhen",   5, 4.7),
        (2,  "US Electronics Wholesale",   "sales@usewholesale.com",  "+1-310-555-0142", "USA",       "Los Angeles",7, 4.5),
        (3,  "Euro Components GmbH",       "supply@eurocomp.de",      "+49-30-555-0201", "Germany",   "Hamburg",    10,4.6),
        (4,  "AppTex Garments Ltd.",       "b2b@apptex.bd",           "+880-2-555-0301", "Bangladesh","Dhaka",      14,4.2),
        (5,  "Nordic Fabrics AB",          "wholesale@nordicfab.se",  "+46-8-555-0401",  "Sweden",    "Stockholm",  12,4.8),
        (6,  "Kitchenware Italia S.r.l.",  "export@kwit.it",          "+39-02-555-0501", "Italy",     "Milan",       8,4.9),
        (7,  "Pacific Sports Supply",      "orders@pacsports.us",     "+1-503-555-0601", "USA",       "Portland",    6,4.4),
        (8,  "Guangzhou Beauty Mfg.",      "sales@gzbeauty.cn",       "+86-20-555-0701", "China",     "Guangzhou",   9,4.3),
        (9,  "Tokyo Toys Distribution",    "b2b@tokyotoys.jp",        "+81-3-555-0801",  "Japan",     "Tokyo",       7,4.6),
        (10, "AutoParts Direct",           "supply@autopartsdirect.us","+1-248-555-0901","USA",       "Detroit",     5,4.5),
        (11, "Organic Foods Co-op",        "orders@ofcoop.ca",        "+1-416-555-1001", "Canada",    "Toronto",     4,4.7),
        (12, "Office Depot B2B",           "corp@officedepotb2b.com", "+1-800-555-1101", "USA",       "Chicago",     3,4.6),
        (13, "Garden World Supplies",      "trade@gardenworld.uk",    "+44-20-555-1201", "UK",        "London",      6,4.4),
        (14, "MediaBooks Distribution",    "orders@mediabooksdist.uk","+44-161-555-1301","UK",        "Manchester",  5,4.8),
        (15, "Seoul Consumer Electronics", "b2b@seoulce.kr",          "+82-2-555-1401",  "South Korea","Seoul",      8,4.5),
    ])

    # ── Products ──────────────────────────────────────────────────────────────
    products_rows = []
    for i, (name, cat_id, brand_id, price, cost, stock, weight, desc) in enumerate(PRODUCTS_DATA, 1):
        sku = f"SKU-{cat_id:02d}-{i:04d}"
        # Add some rating variance
        base_rating = round(random.uniform(3.8, 4.9), 1)
        rating_count = random.randint(12, 980)
        products_rows.append((i, cat_id, brand_id, name, desc, sku, price, cost, stock, weight,
                               base_rating, rating_count, 1))

    c.executemany("""INSERT OR IGNORE INTO products
        (id,category_id,brand_id,name,description,sku,price,cost_price,stock,weight_kg,
         rating_avg,rating_count,is_active) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""", products_rows)

    num_products = len(products_rows)

    # ── Product-Supplier links ────────────────────────────────────────────────
    supplier_map = {
        2: [1,15], 3: [1,2,3], 4: [4,5], 5: [6,12], 6: [7,3],
        7: [14],   8: [8],     9: [9],   10:[10,2],  11:[11],
        12:[12,2], 13:[13,7],
    }
    ps_rows = []
    for prod_id, (name, cat_id, *_) in enumerate(PRODUCTS_DATA, 1):
        sup_list = supplier_map.get(cat_id, [1])
        for j, sup_id in enumerate(sup_list):
            sup_price = round(PRODUCTS_DATA[prod_id-1][4] * random.uniform(0.88, 0.98), 2)
            ps_rows.append((prod_id, sup_id, sup_price, 1 if j == 0 else 0))
    c.executemany("INSERT OR IGNORE INTO product_suppliers(product_id,supplier_id,supply_price,is_primary) VALUES(?,?,?,?)", ps_rows)

    # ── Employees ─────────────────────────────────────────────────────────────
    emp_rows = []
    emp_id = 1
    mgr_map = {}  # dept -> manager_id
    for dept, roles in DEPT_ROLES.items():
        for i, role in enumerate(roles * (4 if dept == "Sales" else 2 if dept == "Customer Support" else 1)):
            if emp_id > 30: break
            fn = random.choice(FIRST_M + FIRST_F)
            ln = random.choice(LAST)
            name = f"{fn} {ln}"
            email = f"{fn.lower()}.{ln.lower()}{emp_id}@datagentra.internal"
            hire = rfmt(datetime(2019,1,1), datetime(2023,12,31))
            salary = round(random.choice({
                "Management":[95000,110000,130000],
                "Sales":[48000,55000,62000,70000],
                "Marketing":[52000,58000,65000],
                "Customer Support":[42000,46000,50000],
                "Operations":[50000,58000,65000],
            }[dept]) + random.randint(-2000,2000), -2)
            mgr_id = mgr_map.get(dept) if i > 0 else None
            emp_rows.append((emp_id, name, email, dept, role, hire, salary, mgr_id))
            if i == 0:
                mgr_map[dept] = emp_id
            emp_id += 1
            if emp_id > 30: break
    c.executemany("INSERT OR IGNORE INTO employees(id,name,email,department,role,hire_date,salary,manager_id) VALUES(?,?,?,?,?,?,?,?)", emp_rows)

    sales_emp_ids = [e[0] for e in emp_rows if e[3] == "Sales"]

    # ── Discount codes ────────────────────────────────────────────────────────
    dc_rows = []
    code_prefixes = ["SAVE","DEAL","FLASH","VIP","SUMMER","WINTER","SPRING","FALL",
                     "WELCOME","LOYAL","BF","CM","NY","BACK2","GIFT","EXTRA","PROMO","HOT","NEW","ECO"]
    used_codes = set()
    for i in range(1, 51):
        while True:
            code = f"{random.choice(code_prefixes)}{random.randint(5,50)}"
            if code not in used_codes:
                used_codes.add(code)
                break
        dtype = random.choice(["pct","pct","pct","fixed"])
        val = random.choice([5,10,10,15,15,20,20,25,30]) if dtype=="pct" else random.choice([5,10,15,20])
        min_val = random.choice([0,0,25,50,75,100])
        max_uses = random.choice([50,100,100,200,500,999])
        uses = random.randint(0, max_uses // 2)
        start = rfmt(datetime(2022,1,1), datetime(2024,6,1))
        end   = rfmt(datetime(2024,6,1), datetime(2025,12,31))
        active = 1 if random.random() > 0.35 else 0
        dc_rows.append((i, code, dtype, val, min_val, max_uses, uses, start, end, active))
    c.executemany("INSERT OR IGNORE INTO discount_codes(id,code,discount_type,discount_value,min_order_value,max_uses,uses_count,valid_from,valid_until,is_active) VALUES(?,?,?,?,?,?,?,?,?,?)", dc_rows)

    # ── Campaigns ─────────────────────────────────────────────────────────────
    camp_rows = []
    camp_dates = [
        (datetime(2022,11,25), datetime(2022,11,30)),
        (datetime(2022,11,28), datetime(2022,12,2)),
        (datetime(2022,6,1),   datetime(2022,8,31)),
        (datetime(2022,8,1),   datetime(2022,9,15)),
        (datetime(2022,11,20), datetime(2022,12,31)),
        (datetime(2023,1,1),   datetime(2023,1,31)),
        (datetime(2023,2,1),   datetime(2023,2,14)),
        (datetime(2023,3,1),   datetime(2023,5,31)),
        (datetime(2023,6,15),  datetime(2023,7,31)),
        (datetime(2023,8,1),   datetime(2023,9,15)),
        (datetime(2023,9,15),  datetime(2023,11,15)),
        (datetime(2023,11,24), datetime(2023,11,28)),
        (datetime(2023,11,20), datetime(2023,12,31)),
        (datetime(2024,1,1),   datetime(2024,1,31)),
        (datetime(2024,2,1),   datetime(2024,2,14)),
        (datetime(2024,3,1),   datetime(2024,5,31)),
        (datetime(2024,6,1),   datetime(2024,7,31)),
        (datetime(2024,7,16),  datetime(2024,7,20)),
        (datetime(2024,8,1),   datetime(2024,9,15)),
        (datetime(2024,11,28), datetime(2024,12,2)),
    ]
    segments_all = ["VIP","Regular","New","At-risk","All"]
    for i, (name, (cstart, cend)) in enumerate(zip(CAMPAIGN_NAMES, camp_dates), 1):
        channel = random.choice(CAMPAIGN_CHANNELS)
        budget  = round(random.choice([5000,8000,10000,15000,20000,30000,50000]))
        spend   = round(budget * random.uniform(0.65, 0.98), 2)
        seg     = random.choice(segments_all)
        camp_rows.append((i, name, channel, budget, spend, fmt(cstart), fmt(cend), seg))
    c.executemany("INSERT OR IGNORE INTO campaigns(id,name,channel,budget,spend,start_date,end_date,target_segment) VALUES(?,?,?,?,?,?,?,?)", camp_rows)

    # ── Users ─────────────────────────────────────────────────────────────────
    user_rows = []
    addr_rows = []
    addr_id   = 1
    used_emails = set()
    for uid in range(1, 501):
        gender = wc(["M","F","Other"], [48,48,4])
        fn = random.choice(FIRST_M if gender=="M" else FIRST_F if gender=="F" else FIRST_M+FIRST_F)
        ln = random.choice(LAST)
        name = f"{fn} {ln}"
        base_email = f"{fn.lower()}.{ln.lower()}"
        email = base_email + "@example.com"
        n = 1
        while email in used_emails:
            email = f"{base_email}{n}@example.com"; n += 1
        used_emails.add(email)
        phone = f"+1-{random.randint(200,999)}-{random.randint(100,999)}-{random.randint(1000,9999)}"
        country = wc(list(CITIES.keys()), [50,15,10,10,7,4,2,2])
        city_state = random.choice(CITIES[country])
        city, state = city_state
        birth_year = random.randint(1970, 2004)
        segment    = wc(["VIP","Regular","New","At-risk","Churned"], [5,45,20,15,15])
        created_at = rfmt(datetime(2021,1,1), datetime(2024,11,30))
        user_rows.append((uid, name, email, phone, city, state, country, birth_year, gender, segment, created_at))

        # Address(es)
        postal = f"{random.randint(10000,99999)}"
        street = f"{random.randint(1,9999)} {random.choice(['Oak','Maple','Main','Park','Lake','Cedar','Hill','River','Pine'])} {random.choice(['St','Ave','Blvd','Dr','Ln','Way','Rd'])}"
        addr_rows.append((addr_id, uid, "Home", street, city, state, country, postal, 1))
        addr_id += 1
        if random.random() < 0.25:  # 25% have a second address
            city2, state2 = random.choice(CITIES[country])
            street2 = f"{random.randint(1,9999)} {random.choice(['Oak','Maple','Main','Park','Lake','Cedar','Hill'])} {random.choice(['St','Ave','Blvd','Dr'])}"
            addr_rows.append((addr_id, uid, "Work", street2, city2, state2, country, f"{random.randint(10000,99999)}", 0))
            addr_id += 1

    c.executemany("INSERT OR IGNORE INTO users(id,name,email,phone,city,state,country,birth_year,gender,segment,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)", user_rows)
    c.executemany("INSERT OR IGNORE INTO addresses(id,user_id,label,street,city,state,country,postal_code,is_default) VALUES(?,?,?,?,?,?,?,?,?)", addr_rows)

    # Build user→address mapping
    user_addrs: dict[int, list[int]] = {}
    for row in addr_rows:
        user_addrs.setdefault(row[1], []).append(row[0])

    # ── Orders, order_items, reviews, returns, inventory ──────────────────────
    product_prices = {row[0]: row[6] for row in products_rows}  # prod_id -> price

    order_rows   = []
    oi_rows      = []
    review_rows  = []
    return_rows  = []
    inv_rows     = []
    oi_id        = 1
    review_id    = 1
    return_id    = 1
    inv_id       = 1

    # Initial inventory entries
    for p in products_rows:
        inv_rows.append((inv_id, p[0], p[8], "initial_stock", None, fmt(datetime(2021,12,1))))
        inv_id += 1

    # Weight orders toward more recent dates
    def random_order_date():
        year = wc([2022,2023,2024], [20,35,45])
        start_y = datetime(year, 1, 1)
        end_y   = datetime(year, 12, 31) if year < 2024 else datetime(2024, 11, 30)
        return rdt(start_y, end_y)

    status_weights  = [5,8,12,60,15]  # pending,processing,shipped,delivered,cancelled
    status_choices  = ["pending","processing","shipped","delivered","cancelled"]

    active_dc_ids = [r[0] for r in dc_rows if r[9] == 1]
    camp_id_list  = list(range(1, 21))

    for order_id in range(1, 3501):
        user_id = random.randint(1, 500)
        employee_id = random.choice(sales_emp_ids)
        status = wc(status_choices, status_weights)

        # Timestamps
        created = random_order_date()
        shipped_at = delivered_at = cancelled_at = None
        if status in ("shipped","delivered"):
            shipped_at = fmt(created + timedelta(days=random.randint(1,4)))
        if status == "delivered":
            delivered_at = fmt(created + timedelta(days=random.randint(5,14)))
        if status == "cancelled":
            cancelled_at = fmt(created + timedelta(days=random.randint(0,3)))

        # Optional discount code
        dc_id = None
        dc_amount = 0.0
        if random.random() < 0.15 and active_dc_ids:
            dc_id = random.choice(active_dc_ids)
            dc_row = dc_rows[dc_id - 1]

        # Optional campaign
        camp_id = random.choice(camp_id_list) if random.random() < 0.30 else None

        # Address
        addr_id_for_order = random.choice(user_addrs.get(user_id, [1]))

        payment = wc(["credit_card","paypal","bank_transfer","debit_card","crypto"],
                     [45,25,15,10,5])

        # Order items (1-4 products)
        n_items = wc([1,2,3,4], [35,40,18,7])
        chosen_prods = random.sample(range(1, num_products+1), min(n_items, num_products))

        subtotal = 0.0
        order_item_ids_for_order = []
        for prod_id in chosen_prods:
            qty = wc([1,2,3], [60,30,10])
            unit_price = product_prices[prod_id]
            dpct = random.choice([0,0,0,5,10,15]) / 100.0
            line = round(unit_price * qty * (1 - dpct), 2)
            subtotal += line
            oi_rows.append((oi_id, order_id, prod_id, qty, unit_price, dpct*100, line))
            order_item_ids_for_order.append((oi_id, prod_id, qty, line))
            # Inventory outgoing
            if status != "cancelled":
                inv_rows.append((inv_id, prod_id, -qty, "order", order_id, fmt(created)))
                inv_id += 1
            oi_id += 1

        subtotal = round(subtotal, 2)

        # Discount
        dc_amount = 0.0
        if dc_id:
            dc_row = dc_rows[dc_id - 1]
            if subtotal >= dc_row[4]:  # min_order_value
                if dc_row[2] == "pct":
                    dc_amount = round(subtotal * dc_row[3] / 100, 2)
                else:
                    dc_amount = min(dc_row[3], subtotal)

        shipping_cost = round(random.choice([0,0,4.99,5.99,7.99,9.99,12.99]), 2)
        total = round(subtotal - dc_amount + shipping_cost, 2)

        order_rows.append((order_id, user_id, employee_id, dc_id, camp_id,
                           addr_id_for_order, status, subtotal, dc_amount,
                           shipping_cost, total, payment, fmt(created),
                           shipped_at, delivered_at, cancelled_at))

        # Reviews (only for delivered orders, ~28% of items)
        if status == "delivered" and delivered_at:
            for oi_id_r, prod_id_r, qty_r, _ in order_item_ids_for_order:
                if random.random() < 0.28:
                    rating = wc([1,2,3,4,5], [3,7,15,30,45])
                    rev_date = fmt(datetime.strptime(delivered_at, "%Y-%m-%d %H:%M:%S") +
                                   timedelta(days=random.randint(1,30)))
                    title = random.choice(REVIEW_TITLES[rating])
                    body  = random.choice(REVIEW_BODIES[rating])
                    helpful = random.randint(0, 45)
                    review_rows.append((review_id, prod_id_r, user_id, order_id,
                                        rating, title, body, helpful, 1, rev_date))
                    review_id += 1

        # Returns (only for delivered orders, ~11% of items)
        if status == "delivered" and delivered_at:
            for oi_id_r, prod_id_r, qty_r, line_r in order_item_ids_for_order:
                if random.random() < 0.11:
                    reason    = random.choice(RETURN_REASONS)
                    ret_status= wc(["pending","approved","refunded","rejected"], [10,20,60,10])
                    refund    = round(line_r, 2) if ret_status == "refunded" else 0.0
                    ret_date  = fmt(datetime.strptime(delivered_at, "%Y-%m-%d %H:%M:%S") +
                                    timedelta(days=random.randint(1,25)))
                    resolved  = (fmt(datetime.strptime(ret_date, "%Y-%m-%d %H:%M:%S") +
                                     timedelta(days=random.randint(1,7)))
                                 if ret_status != "pending" else None)
                    return_rows.append((return_id, order_id, oi_id_r, reason,
                                        ret_status, refund, ret_date, resolved))
                    # Restock inventory
                    if ret_status == "refunded":
                        inv_rows.append((inv_id, prod_id_r, qty_r, "return", order_id,
                                         ret_date if ret_date else fmt(created)))
                        inv_id += 1
                    return_id += 1

    # Periodic restocks
    for prod_id in range(1, num_products+1):
        for _ in range(random.randint(1, 4)):
            restock_qty = random.choice([50,100,150,200,250])
            inv_rows.append((inv_id, prod_id, restock_qty, "restock", None, rfmt()))
            inv_id += 1

    # Bulk insert
    c.executemany("""INSERT OR IGNORE INTO orders
        (id,user_id,employee_id,discount_code_id,campaign_id,shipping_address_id,
         status,subtotal,discount_amount,shipping_cost,total_amount,payment_method,
         created_at,shipped_at,delivered_at,cancelled_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", order_rows)

    c.executemany("""INSERT OR IGNORE INTO order_items
        (id,order_id,product_id,quantity,unit_price,discount_pct,subtotal)
        VALUES(?,?,?,?,?,?,?)""", oi_rows)

    c.executemany("""INSERT OR IGNORE INTO reviews
        (id,product_id,user_id,order_id,rating,title,body,helpful_votes,is_verified,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?)""", review_rows)

    c.executemany("""INSERT OR IGNORE INTO returns
        (id,order_id,order_item_id,reason,status,refund_amount,created_at,resolved_at)
        VALUES(?,?,?,?,?,?,?,?)""", return_rows)

    c.executemany("""INSERT OR IGNORE INTO inventory_log
        (id,product_id,change_qty,reason,reference_id,created_at)
        VALUES(?,?,?,?,?,?)""", inv_rows)

    conn.commit()

    # ── Summary ───────────────────────────────────────────────────────────────
    for tbl in ["categories","brands","suppliers","products","product_suppliers",
                "users","addresses","employees","discount_codes","campaigns",
                "orders","order_items","reviews","returns","inventory_log"]:
        n = conn.execute(f'SELECT COUNT(*) FROM "{tbl}"').fetchone()[0]
        print(f"  {tbl:25s} {n:>6,} rows")

    conn.close()
    print(f"\nDatabase created: {db_path}")


if __name__ == "__main__":
    seed(DB_PATH)
