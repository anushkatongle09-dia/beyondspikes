/**
 * Built-in foods for offline / USDA-unavailable use (per ~100 g edible portion unless noted).
 * Nutrient IDs match FoodData Central (carbohydrate 1005, fiber 1079, sugars 2000).
 * Values are approximate illustrative averages (not a substitute for labeled products).
 */
(function () {
  const C = 1005;
  const F = 1079;
  const S = 2000;

  function n(carbs, fiber, sugars) {
    const out = [{ nutrientId: C, value: carbs }, { nutrientId: F, value: fiber }];
    out.push({ nutrientId: S, value: sugars != null ? sugars : 0 });
    return out;
  }

  let id = -10001;

  window.BG_SPIKE_LOCAL_FOODS = [
    { fdcId: id++, description: "Oatmeal, cooked, plain", foodNutrients: n(12, 1.7, 0.5), searchText: "oatmeal oats porridge hot cereal" },
    { fdcId: id++, description: "Corn flakes cereal, with milk typical bowl", foodNutrients: n(24, 1.2, 8), searchText: "cereal corn flakes breakfast" },
    { fdcId: id++, description: "White rice, cooked, long-grain", foodNutrients: n(28, 0.4, 0.05), searchText: "rice white steamed" },
    { fdcId: id++, description: "Brown rice, cooked", foodNutrients: n(23, 1.8, 0.4), searchText: "rice brown whole grain" },
    { fdcId: id++, description: "Pasta, cooked, enriched, plain", foodNutrients: n(25, 1.8, 0.6), searchText: "pasta spaghetti noodles macaroni" },
    { fdcId: id++, description: "Bread, white, commercial slice", foodNutrients: n(49, 2.7, 5), searchText: "bread white toast sandwich" },
    { fdcId: id++, description: "Bread, whole wheat, slice", foodNutrients: n(41, 7, 5), searchText: "bread wheat whole grain toast" },
    { fdcId: id++, description: "Bagel, plain", foodNutrients: n(50, 2, 6), searchText: "bagel" },
    { fdcId: id++, description: "Tortilla, flour, medium", foodNutrients: n(45, 2.4, 1), searchText: "tortilla flour wrap" },
    { fdcId: id++, description: "Potato, baked, flesh and skin", foodNutrients: n(21, 2.2, 1.2), searchText: "potato baked" },
    { fdcId: id++, description: "Sweet potato, baked", foodNutrients: n(20, 3.3, 6.5), searchText: "sweet potato yam" },
    { fdcId: id++, description: "French fries, restaurant-style", foodNutrients: n(41, 3.8, 0.3), searchText: "fries french fried potato" },
    { fdcId: id++, description: "Banana, raw", foodNutrients: n(23, 2.6, 12), searchText: "banana" },
    { fdcId: id++, description: "Apple, raw, with skin", foodNutrients: n(14, 2.4, 10), searchText: "apple" },
    { fdcId: id++, description: "Orange, raw", foodNutrients: n(12, 2.4, 9), searchText: "orange citrus" },
    { fdcId: id++, description: "Grapes, red or green", foodNutrients: n(17, 0.9, 16), searchText: "grapes" },
    { fdcId: id++, description: "Strawberries, raw", foodNutrients: n(8, 2, 4.9), searchText: "strawberries berry" },
    { fdcId: id++, description: "Blueberries, raw", foodNutrients: n(14, 2.4, 10), searchText: "blueberries berry" },
    { fdcId: id++, description: "Orange juice, from concentrate", foodNutrients: n(10, 0.2, 8.4), searchText: "juice orange oj" },
    { fdcId: id++, description: "Milk, lowfat 2%", foodNutrients: n(5, 0, 5), searchText: "milk dairy 2 percent" },
    { fdcId: id++, description: "Greek yogurt, plain, nonfat", foodNutrients: n(4, 0, 4), searchText: "yogurt greek" },
    { fdcId: id++, description: "Ice cream, vanilla", foodNutrients: n(23, 0.7, 21), searchText: "ice cream dessert" },
    { fdcId: id++, description: "Cheese, cheddar", foodNutrients: n(1.3, 0, 0.5), searchText: "cheese cheddar" },
    { fdcId: id++, description: "Egg, whole, boiled", foodNutrients: n(1.1, 0, 1.1), searchText: "egg boiled hard" },
    { fdcId: id++, description: "Chicken breast, grilled, skinless", foodNutrients: n(0, 0, 0), searchText: "chicken breast meat" },
    { fdcId: id++, description: "Salmon, Atlantic, baked", foodNutrients: n(0, 0, 0), searchText: "salmon fish" },
    { fdcId: id++, description: "Ground beef, 85% lean, cooked", foodNutrients: n(0, 0, 0), searchText: "beef burger ground" },
    { fdcId: id++, description: "Black beans, cooked", foodNutrients: n(20, 8.7, 0.3), searchText: "beans black legumes" },
    { fdcId: id++, description: "Lentils, cooked", foodNutrients: n(20, 7.9, 1.8), searchText: "lentils soup legumes" },
    { fdcId: id++, description: "Chickpeas (garbanzo), cooked", foodNutrients: n(27, 7.6, 5), searchText: "chickpeas garbanzo hummus bean" },
    { fdcId: id++, description: "Broccoli, steamed", foodNutrients: n(7, 2.6, 1.7), searchText: "broccoli vegetable" },
    { fdcId: id++, description: "Carrots, raw", foodNutrients: n(10, 2.8, 4.7), searchText: "carrots vegetable" },
    { fdcId: id++, description: "Spinach, raw", foodNutrients: n(3.6, 2.2, 0.4), searchText: "spinach salad greens" },
    { fdcId: id++, description: "Salad, mixed greens", foodNutrients: n(3, 1.5, 1), searchText: "salad lettuce greens" },
    { fdcId: id++, description: "Pizza, cheese, typical slice", foodNutrients: n(33, 2.5, 3.6), searchText: "pizza cheese slice" },
    { fdcId: id++, description: "Hamburger, fast-food style with bun", foodNutrients: n(31, 2, 6), searchText: "burger hamburger fast food" },
    { fdcId: id++, description: "Soft drink, cola", foodNutrients: n(11, 0, 11), searchText: "soda cola coke pop soft drink" },
    { fdcId: id++, description: "Peanut butter, smooth", foodNutrients: n(20, 6, 9), searchText: "peanut butter pb" },
    { fdcId: id++, description: "Almonds, dry roasted", foodNutrients: n(22, 12.5, 4.4), searchText: "almonds nuts" },
    { fdcId: id++, description: "Pretzels, hard", foodNutrients: n(80, 3.4, 2.9), searchText: "pretzels snack" },
    { fdcId: id++, description: "Chocolate chip cookie, homemade style", foodNutrients: n(58, 2.5, 28), searchText: "cookie chocolate chip dessert" },
    { fdcId: id++, description: "Granola bar, chewy, chocolate chip", foodNutrients: n(64, 4, 28), searchText: "granola bar snack" },
    { fdcId: id++, description: "Potato chips, plain, salted", foodNutrients: n(53, 4.8, 0.3), searchText: "chips potato crisps" },
    { fdcId: id++, description: "Watermelon, raw", foodNutrients: n(8, 0.4, 6), searchText: "watermelon fruit" },
    { fdcId: id++, description: "Avocado, raw", foodNutrients: n(9, 6.7, 0.7), searchText: "avocado guacamole" },
  ];
})();
