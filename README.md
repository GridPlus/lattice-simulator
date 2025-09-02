# Lattice1 Device Simulator

A comprehensive software simulator for the GridPlus Lattice1 hardware wallet, designed for development, testing, and educational purposes. This simulator provides a full-featured emulation of the Lattice1 device, including wallet management, transaction signing, and key-value storage.

## 🚀 Features

### Core Device Simulation
- **Lattice1 Protocol Compliance**: Full implementation of the Lattice1 communication protocol
- **Hardware Wallet Emulation**: Simulates the physical Lattice1 device behavior
- **Firmware Version Support**: Configurable firmware versions with feature compatibility
- **Device State Management**: Paired/unpaired states, locked/unlocked modes

### Wallet Management
- **Multi-Currency Support**: Ethereum (ETH), Bitcoin (BTC), Solana (SOL)
- **HD Wallet Generation**: BIP-44 compliant hierarchical deterministic wallets
- **Account Management**: External and internal accounts with proper derivation paths
- **Address Generation**: Dynamic address derivation with configurable counts
- **Wallet Pairing**: Secure pairing with client applications

### Transaction & Signing
- **Transaction Signing**: Support for various transaction types
- **Message Signing**: Ethereum message signing and verification
- **Multi-Signature Support**: Advanced signing capabilities
- **User Approval Flow**: Simulated user interaction for transaction approval

### Key-Value Storage
- **Address Tags**: Store and manage cryptocurrency address labels
- **Custom Records**: Flexible key-value storage system
- **Data Persistence**: Local storage with encryption support
- **Record Management**: Add, remove, and query stored records

### Developer Tools
- **Real-time Monitoring**: Live device state and connection monitoring
- **Protocol Debugging**: Detailed logging of all protocol communications
- **State Inspection**: View and modify device state during development
- **Testing Framework**: Comprehensive test suite for validation

## 📋 Prerequisites

- **Node.js**: Version 18.0.0 or higher
- **Package Manager**: pnpm (recommended) or npm
- **Git**: For cloning the repository

## 🛠️ Installation

### 1. Clone the Repository
```bash
git clone https://github.com/GridPlus/gridplus.git
cd gridplus/lattice-simulator
```

### 2. Install Dependencies
```bash
# Using pnpm (recommended)
pnpm install

# Or using npm
npm install
```

### 3. Environment Setup
The simulator runs with default configuration and doesn't require additional environment variables for basic operation.

## 🚀 Running the Simulator

### Development Mode
```bash
# Start the development server
pnpm dev

# The simulator will be available at http://localhost:3000
```

### Production Build
```bash
# Build the application
pnpm build

# Start the production server
pnpm start
```

### Testing
```bash
# Run unit tests
pnpm test

# Run tests with UI
pnpm test:ui

# Run tests with coverage
pnpm test:coverage

# Type checking
pnpm type-check
```

## 🔧 Configuration

### Device Settings
The simulator can be configured through the web interface:

1. **Firmware Version**: Set the simulated firmware version
2. **Device Name**: Customize the device identifier
3. **Security Settings**: Configure pairing and approval requirements
4. **Network Settings**: Adjust connection parameters

### Protocol Configuration
- **Encryption**: AES-256 encryption for secure communications
- **Checksums**: CRC32 validation for message integrity
- **Timeouts**: Configurable request timeouts and delays

## 📱 Usage Guide

### 1. Initial Setup

#### Starting the Simulator
1. Launch the application: `pnpm dev`
2. Open your browser to `http://localhost:3000`
3. The simulator will start in an unpaired state

#### Device Connection
1. Navigate to the **Connection** page
2. The simulator displays connection status and device information
3. Note the device ID for client applications

### 2. Device Pairing

#### Pairing Process
1. **Client Connection**: Client applications connect to the simulator endpoint
2. **Pairing Request**: Client initiates pairing with device ID
3. **Approval**: Simulator prompts for pairing approval
4. **Key Exchange**: Secure key exchange establishes encrypted communication
5. **Paired State**: Device enters paired mode with the client

#### Pairing Verification
- Check the **Connection** page for pairing status
- Monitor the device state in real-time
- Verify encrypted communication is established

### 3. Wallet Setup

#### Initializing Wallets
1. Navigate to the **Wallets** page
2. Click **Initialize Wallets** to generate HD wallet accounts
3. The simulator generates:
   - Ethereum accounts (external/internal)
   - Bitcoin accounts (legacy/segwit/wrapped-segwit)
   - Solana accounts (external/internal)

#### Account Management
- **View Accounts**: Browse all generated accounts with derivation paths
- **Set Active**: Designate primary accounts for transactions
- **Create More**: Generate additional accounts as needed
- **Account Types**: External (receiving) vs Internal (change) accounts

### 4. Transaction Operations

#### Signing Transactions
1. **Client Request**: Client sends transaction data to simulator
2. **User Approval**: Simulator prompts for transaction approval
3. **Signature Generation**: Device signs the transaction
4. **Response**: Signed transaction returned to client

#### Supported Operations
- **Ethereum**: Transaction signing, message signing
- **Bitcoin**: Transaction signing for various address types
- **Solana**: Transaction signing and verification

### 5. Key-Value Management

#### Address Tags
1. **Add Tags**: Associate names with cryptocurrency addresses
2. **Manage Records**: View, edit, and remove stored tags
3. **Search**: Filter and search through stored records
4. **Bulk Operations**: Add or remove multiple records

#### Record Structure
- **Key**: Address identifier (e.g., cryptocurrency address)
- **Value**: Human-readable label or description
- **Type**: Record classification for organization
- **Metadata**: Additional information and timestamps

## 🔌 API Integration

### Client Connection
```typescript
// Example client connection to simulator
const baseUrl = `http://localhost:3000`;
const deviceId = 'your-device-id';
const name = 'Lattice Manager'
const privKey = 'A_PRIVATE_KEY'

// Connect and pair with device
const client = new Client({
    baseUrl,
    deviceId,
    privKey,
    name,
});
```

### Protocol Endpoints
- **POST** `/api/[deviceId]` - Device communication endpoint
- **GET** `/api/[deviceId]` - Device status and information

### Supported Request Types
- **Connect** (0x01): Initial connection and pairing
- **Get Wallets** (0x04): Retrieve active wallet information
- **Get KV Records** (0x07): Query stored key-value pairs
- **Add KV Records** (0x08): Store new key-value pairs
- **Remove KV Records** (0x09): Delete stored records
- **Sign** (0x03): Transaction and message signing

## 🧪 Testing

### Test Framework
The simulator includes a comprehensive test suite:

```bash
# Run all tests
pnpm test

# Run specific test files
pnpm test src/lib/simulator.test.ts

# Run tests with coverage
pnpm test:coverage
```

### Test Categories
- **Unit Tests**: Individual component testing
- **Integration Tests**: End-to-end workflow testing
- **Protocol Tests**: Communication protocol validation
- **Wallet Tests**: HD wallet generation and management

### Mock Data
- **Test Mnemonics**: Pre-configured test phrases
- **Sample Transactions**: Example transaction data
- **Mock Records**: Sample key-value data

## 🐛 Troubleshooting

### Common Issues

#### Connection Problems
- **Device Not Found**: Verify the device ID in the URL
- **Pairing Failed**: Check client authentication and keys
- **Timeout Errors**: Increase timeout values in client configuration

#### Wallet Issues
- **Accounts Not Generated**: Ensure wallets are initialized
- **Derivation Path Errors**: Verify BIP-44 compliance
- **Address Mismatch**: Check coin type and account indices

#### Protocol Errors
- **Checksum Failures**: Verify message integrity
- **Encryption Errors**: Check shared secret establishment
- **Buffer Overflow**: Validate request payload sizes

### Debug Mode
Enable detailed logging:
1. Open browser developer tools
2. Check console for detailed protocol logs
3. Monitor network requests and responses
4. Use the simulator's built-in debugging tools

### Log Analysis
- **Protocol Handler**: Detailed request/response logging
- **Device Manager**: State change and operation logs
- **Wallet Services**: Account generation and management logs
- **Route Handler**: API endpoint and communication logs

## 🔒 Security Considerations

### Development Use Only
- **Not for Production**: This is a development tool, not a production wallet
- **Test Data**: Use only test cryptocurrencies and addresses
- **Secure Environment**: Run in isolated development environments

### Data Protection
- **Local Storage**: All data stored locally in the browser
- **No External Calls**: Simulator operates entirely offline
- **Encrypted Communication**: Protocol-level encryption for client communication

## 🤝 Contributing

### Development Setup
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

### Code Standards
- **TypeScript**: Use strict typing and interfaces
- **Testing**: Maintain high test coverage
- **Documentation**: Update docs for new features
- **Linting**: Follow project ESLint configuration

### Testing Guidelines
- **Unit Tests**: Test individual functions and components
- **Integration Tests**: Test complete workflows
- **Protocol Tests**: Validate communication protocols
- **Edge Cases**: Test error conditions and boundaries

## 📚 API Reference

### Device Management
- **Connection**: Establish and manage device connections
- **Pairing**: Secure device pairing and authentication
- **State Management**: Monitor and control device state

### Wallet Operations
- **Account Generation**: Create HD wallet accounts
- **Address Derivation**: Generate cryptocurrency addresses
- **Transaction Signing**: Sign various transaction types

### Storage Operations
- **Key-Value Records**: Store and retrieve custom data
- **Address Tags**: Manage cryptocurrency address labels
- **Data Persistence**: Local storage with encryption

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

### Documentation
- **API Reference**: Complete API documentation
- **Protocol Specs**: Lattice1 protocol documentation
- **Examples**: Sample code and use cases

### Community
- **GitHub Issues**: Report bugs and request features
- **Discussions**: Community support and questions
- **Contributing**: Guidelines for contributors

### Development Support
- **Debug Tools**: Built-in debugging and monitoring
- **Test Suite**: Comprehensive testing framework
- **Logging**: Detailed operation logging

---

**Note**: This simulator is designed for development and testing purposes. Do not use it for storing real cryptocurrency assets or production transactions.
