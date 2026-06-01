const axios = require('axios');

async function test() {
  try {
    const res = await axios.post('http://localhost:3000/api/v1/hotel/webhooks/channel-manager/c39cd6a2-0954-4e70-92ac-45ace17e0324/0545190c-a467-4d69-91b9-94265b07d5cf', {
      event: "BookingModified",
      booking: {
        id: "MMT-998877",
        roomTypeId: "OTA_DELUXE_ROOM ",
        guest: {
          firstName: "Rahul",
          lastName: "Sharma",
          email: "rahul.sharma@example.com",
          phone: "+919876543210"
        },
        checkInDate: "2026-06-15",
        checkOutDate: "2026-06-18",
        numAdults: 3,
        numChildren: 0,
        totalAmount: 18000
      }
    }, {
      headers: { 'x-api-key': 'test_secret_key' }
    });
    console.log("Success:", res.data);
  } catch (err) {
    console.error("Error Status:", err.response?.status);
    console.error("Error Data:", err.response?.data);
  }
}
test();
