export type Resort = {
  id: string; name: string; location: string; area: string; price: number; rating: number;
  reviews: number; image: string; tag: string; category: string; amenities: string[];
  description: string; capacity: number; room: string;
};
// Fictional properties and sample rates. No live inventory or commercial claims.
export const resorts: Resort[] = [
  { id: "meghla", name: "Meghla Hill Retreat", location: "Chimbuk Road, Bandarban", area: "Chimbuk", price: 6500, rating: 4.9, reviews: 128, image: "/images/pool-retreat.jpg", tag: "Guest favorite", category: "Luxury escapes", amenities: ["Pool", "Wi-Fi", "Restaurant", "Mountain view", "Parking"], description: "Slow mornings, a hillside pool, and room to breathe. Settle into a light-filled suite with a private balcony overlooking the green valley.", capacity: 4, room: "Valley View Suite" },
  { id: "sangu", name: "Sangu Valley Resort", location: "Milonchari, Bandarban", area: "Milonchari", price: 4200, rating: 4.8, reviews: 96, image: "/images/forest-cabin.jpg", tag: "Surrounded by nature", category: "Nature retreats", amenities: ["Wi-Fi", "Restaurant", "Mountain view", "Parking"], description: "Tucked into a canopy of trees, this quiet retreat is made for long conversations, slow cups of tea, and days without an itinerary.", capacity: 3, room: "Forest View Cottage" },
  { id: "cloud-nine", name: "Cloud Nine Cottages", location: "Nilgiri Road, Bandarban", area: "Nilgiri", price: 2800, rating: 4.7, reviews: 74, image: "/images/hill-cottage.jpg", tag: "A cozy little escape", category: "Cozy cottages", amenities: ["Restaurant", "Mountain view", "Parking"], description: "A simple, comfortable cottage with a view worth waking up for. Bring a book, find your favorite spot on the veranda, and stay a little longer.", capacity: 2, room: "Hillside Double Cottage" },
  { id: "aranya", name: "Aranya Eco Lodge", location: "Milonchari, Bandarban", area: "Milonchari", price: 3500, rating: 4.8, reviews: 61, image: "/images/forest-cabin.jpg", tag: "Leave the city behind", category: "Nature retreats", amenities: ["Wi-Fi", "Restaurant", "Parking"], description: "Natural textures, leafy paths, and warm hospitality. A thoughtful hideaway for travelers who like their holidays a little closer to the earth.", capacity: 4, room: "Garden Family Lodge" },
  { id: "nilachal", name: "Nilachal Panorama", location: "Nilachal, Bandarban", area: "Nilachal", price: 8500, rating: 4.9, reviews: 112, image: "/images/pool-retreat.jpg", tag: "Room for a little luxury", category: "Luxury escapes", amenities: ["Pool", "Wi-Fi", "Restaurant", "Mountain view", "Parking", "Air conditioning"], description: "Wide-open valley views meet thoughtful comforts. Enjoy a spacious suite, a refreshing pool, and beautiful golden-hour evenings.", capacity: 4, room: "Panorama Premium Suite" },
  { id: "bamboo", name: "Bamboo Grove Hideaway", location: "Lama, Bandarban", area: "Lama", price: 1800, rating: 4.6, reviews: 43, image: "/images/hill-cottage.jpg", tag: "Big views, little budget", category: "Budget friendly", amenities: ["Restaurant", "Mountain view", "Parking"], description: "A welcoming hillside base for your next adventure. Simple rooms and peaceful surroundings make it easy to focus on the moments that matter.", capacity: 2, room: "Bamboo Double Room" },
];
export const money = (value: number) => `৳${value.toLocaleString("en-BD")}`;
export function nightsBetween(checkIn: string, checkOut: string) {
  const duration = (Date.parse(checkOut) - Date.parse(checkIn)) / 86400000;
  return Number.isFinite(duration) && duration > 0 ? Math.floor(duration) : 0;
}
export function bookingPrice(price: number, nights: number, rooms = 1) {
  const subtotal = price * nights * rooms;
  const serviceFee = Math.round(subtotal * 0.05);
  const total = subtotal + serviceFee;
  const advance = Math.round(total * 0.3);
  return { subtotal, serviceFee, total, advance, dueAtResort: total - advance };
}
export function refundAmount(advance: number) {
  const cancellationFee = Math.round(advance * 0.2);
  return { cancellationFee, refund: advance - cancellationFee };
}
export type Booking = {
  id: string; resortId: string; room: string; checkIn: string; checkOut: string; guests: number;
  rooms: number; name: string; total: number; advance: number; status: "Reserved" | "Requested" | "Confirmed" | "Declined" | "Cancelled";
  createdAt: string;
};
