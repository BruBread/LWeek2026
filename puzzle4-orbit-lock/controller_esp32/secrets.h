// Wi-Fi networks, in order of preference: NexusV first, walawifi if NexusV doesn't connect within 4 s. Each ip must be free on that network and sit in its router's subnet.
Net NETS[] = {
  { "NexusV",     "aurorawashere",     IPAddress(192, 168, 0, 52), IPAddress(192, 168, 0, 1) },
  { "walawifi",   "walapassword", IPAddress(192, 168, 1, 52), IPAddress(192, 168, 1, 1) },   // backup: joined if NexusV isn't there within 4 s
};
