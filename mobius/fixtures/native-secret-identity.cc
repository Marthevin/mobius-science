// Compile the real helper against fake Security APIs; never query the host Keychain.
#include <Security/Security.h>
#include <cassert>
#include <cstring>
#include <iostream>
#include <sstream>
#include <string>

static std::string expected_identity;
static std::string stored;
static int reads = 0;
static int creates = 0;
static bool cleared = false;

static OSStatus Find(CFTypeRef, UInt32 service_size, const char* service,
    UInt32 account_size, const char* account, UInt32* size, void** password,
    SecKeychainItemRef*) {
  assert(std::string(service, service_size) == expected_identity + " Safe Storage");
  const std::string account_name(account, account_size);
  assert(account_name == expected_identity + " Key" || account_name == expected_identity);
  ++reads;
  if (stored.empty()) return errSecItemNotFound;
  assert(account_name == expected_identity + " Key");
  *size = stored.size();
  auto data = new unsigned char[*size];
  std::memcpy(data, stored.data(), *size);
  *password = data;
  return errSecSuccess;
}
static OSStatus Add(SecKeychainRef, UInt32 service_size, const char* service,
    UInt32 account_size, const char* account, UInt32 size, const void* password,
    SecKeychainItemRef*) {
  assert(stored.empty());
  assert(std::string(service, service_size) == expected_identity + " Safe Storage");
  assert(std::string(account, account_size) == expected_identity + " Key");
  stored.assign(static_cast<const char*>(password), size);
  ++creates;
  return errSecSuccess;
}
static OSStatus Free(SecKeychainAttributeList*, void* password) {
  const auto data = static_cast<unsigned char*>(password);
  for (size_t i = 0; i < stored.size(); ++i) assert(data[i] == 0);
  cleared = true;
  delete[] data;
  return errSecSuccess;
}

#define SecKeychainFindGenericPassword Find
#define SecKeychainAddGenericPassword Add
#define SecKeychainItemFreeContent Free
#define main SecretMain
#include "../../packages/credential-identity-probe-native/src/credential_secret.cc"
#undef main

static std::pair<int, std::string> Invoke(const std::string& operation,
    const std::string& name, const std::string& input = "") {
  std::istringstream in(input);
  std::ostringstream out;
  auto old_in = std::cin.rdbuf(in.rdbuf());
  auto old_out = std::cout.rdbuf(out.rdbuf());
  const char* argv[] = {"credential_secret", operation.c_str(), name.c_str()};
  const int status = SecretMain(3, const_cast<char**>(argv));
  std::cin.rdbuf(old_in);
  std::cin.clear();
  std::cout.rdbuf(old_out);
  return {status, out.str()};
}

int main() {
  for (const auto& name : {"Mobius Science", "Mobius Science (DEV)",
      "Open-Science", "Open-Science (DEV)", "Open Science", "Open Science (DEV)"}) {
    expected_identity = name;
    stored = "existing-private-key";
    reads = creates = 0;
    cleared = false;
    auto read = Invoke("read-key", name);
    assert(read.first == 0 && read.second == stored);
    assert(reads == 1 && creates == 0 && cleared);
    stored.clear();
    reads = creates = 0;
    cleared = false;
    auto created = Invoke("create-key", name, "new-private-key");
    assert(created.first == 0 && created.second == "new-private-key");
    assert(reads == 3 && creates == 1 && cleared);
  }
  for (const auto& name : {"", "unknown", "Mobius Science (dev)", "Mobius Science Extra"}) {
    reads = creates = 0;
    auto rejected = Invoke("read-key", name);
    assert(rejected.first != 0 && rejected.second.empty());
    assert(reads == 0 && creates == 0);
    rejected = Invoke("create-key", name, "untrusted-candidate");
    assert(rejected.first != 0 && rejected.second.empty());
    assert(reads == 0 && creates == 0);
  }
  std::cout << "passed 20 isolated secret identity scenarios\n";
}
