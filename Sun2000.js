// From iobroker Forum: "Huawei Sun2000 & ioBroker via JS script funktioniert"
// https://forum.iobroker.net/topic/53005/huawei-sun2000-iobroker-via-js-script-funktioniert
// Started by Kachel, modified and extended by Chris_B
//

// define javascript instance; please change according to your setup
const JavaInst = "javascript.0.";

createState(JavaInst + "Solarpower.Derived.BatteryOverview",  "",  {read: true, write: true, name: "Battery Overview SOC"});
createState(JavaInst + "Solarpower.Derived.HouseConsumption", "",  {read: true, write: true, name: "Consumption of House", unit: "W"});
createState(JavaInst + "Solarpower.Derived.YieldToday",       "",  {read: true, write: true, name: "Yield Today", unit: "kW"});
createState(JavaInst + "Solarpower.Derived.IsBatteryLoading",  0,  {read: true, write: true, name: "Luna 2000 Battery is loading", type: "number"});
createState(JavaInst + "Solarpower.Derived.IsGridExporting",   0,  {read: true, write: true, name: "Exporting Power to Grid", type: "number"});
createState(JavaInst + "Solarpower.Derived.PeakPanelPower",    0,  {read: true, write: true, name: "Peak panel power today"});
createState(JavaInst + "Solarpower.Derived.GridExportSum",     0,  {read: true, write: true, name: "Total export to grid", unit: "kWh"});
createState(JavaInst + "Solarpower.Derived.GridImportSum",     0,  {read: true, write: true, name: "Total import from grid", unit: "kWh"});
createState(JavaInst + "Solarpower.Derived.GridExportToday",   0,  {read: true, write: true, name: "Export to grid today", unit: "kWh"});
createState(JavaInst + "Solarpower.Derived.GridImportToday",   0,  {read: true, write: true, name: "Import from grid today", unit: "kWh"});
createState(JavaInst + "Solarpower.Derived.ConsumptionToday",  0,  {read: true, write: true, name: "Consumption today", unit: "kWh"});
createState(JavaInst + "Solarpower.Derived.ConsumptionSum",    0,  {read: true, write: true, name: "Consumption total sum", unit: "kWh"});
createState(JavaInst + "Solarpower.Derived.ConsumptionStart",  0,  {read: true, write: true, name: "Consumption total sum at start of day", unit: "kWh"});
createState(JavaInst + "Solarpower.Derived.WorkingMode",       0,  {read: true, write: true, name: "Working mode", unit: "kWh"});


var ModbusRTU = require("modbus-serial");
var fs = require('fs');
var client = new ModbusRTU();
var testCreateState = 0;
const SHI = "Solarpower.Huawei.Inverter.";
const SHM = "Solarpower.Huawei.Meter.";

var currentinverter = 1;

var modbusErrorMessages =
[   "Unknown error",
    "Illegal function (device does not support this read/write function)",
    "Illegal data address (register not supported by device)",
    "Illegal data value (value cannot be written to this register)",
    "Slave device failure (device reports internal error)",
    "Acknowledge (requested data will be available later)",
    "Slave device busy (retry request again later)"
];

// Enter your inverter modbus IP and port here
const ModBusPort = 502;
const ModBusHost = "192.168.1.127";

ConnectModbus();

// Enter the Modbus-IDs of your Sun2000 inverters here (example for two inverters): const ModBusIDs = [16, 1];
const ModBusIDs = [1];
// On which Modbus-ID can we reach the power meter? (via Sun2000!)
const PowerMeterID = 0;
// Enter your battery stack setup. 2 dimensional array, e.g. [[3, 2], [3, 0]] means:
// First inverter has two battery stacks with 3 + 2 battery modules
// while second inverter has only one battery stack with 3 battery modules
const BatteryUnits = [[3, 0]];

// These register spaces need to be read
const RegToRead = 
[ [32000, 116],   // inverter status -                            read fast
  [37000, 68],    // battery information -                        read fast
  [37100, 114],   // meter info -                                 read fast
  [37700, 100],   // battery information -                        read fast
  [38200, 100],   // additional battery information -             read fast
  [30000, 81],    // model info, SN, max Power (static info) -    read slow
  [37800, 100],   // additional battery information -             read slow
  [38300, 100],   // additional battery information -             read slow
  [38400, 100],   // additional battery information -             read slow
  [47081, 8]      // additional battery information -             read slow
//[35300, 40]     // inverter power adjustments -                 do not read
];  
const RegFast = 5;      // number of register spaces to read fast (must be < RegToRead.length)
const RegFastMod = 10;  // read slow registers every n'th time (mod operator)
var RegReadCnt = 0;     // Loop counter
var RegToReadPtr = 0;   // pointer to register spaces

// create data buffer (can be optimzed further)
// BufOffset must be equal or smaller to smallest register address that is read
// BufOffset + BufLength must be at leat as large as largest register address read
const BufOffset = 30000;
const BufLength = 18000;
var Buffer = new Array(2);
for ( var i=0; i < ModBusIDs.length; i++) Buffer[i] = new Array(BufLength);


// some helper functions
function readUnsignedInt16(array)
{   return array[0];
}

function readUnsignedInt32(array)
{   return array[0] * 256 * 256 + array[1];
}

function readSignedInt16(array)
{   var value = 0;
    if (array[0] > 32767)   value = array[0] - 65535; 
        else                value = array[0];
    return value;
}

function readSignedInt32(array)
{   var value = 0;
    for (var i = 0; i < 2; i++) { value = (value << 16) | array[i]; }
    return value;
}


// the following five functions directly read data from the buffer
// the buffer offset must therefore be used
function getU16(dataarray, index)
{   
    index = index - BufOffset;
    return readUnsignedInt16(dataarray.slice(index, index+1));
}

function getU32(dataarray, index)
{   
    index = index - BufOffset;
    return readUnsignedInt32(dataarray.slice(index, index+2));
}

function getI16(dataarray, index)
{   
    index = index - BufOffset;
    return readSignedInt16(dataarray.slice(index, index+1));
}

function getI32(dataarray, index)
{   
    index = index - BufOffset;
    return readSignedInt32(dataarray.slice(index, index+2));
}

function getStr(dataarray, index, length)
{   
    index = index - BufOffset;
    var bytearray = [];
    for(var i = 0; i < length; i++)
    {   bytearray.push(dataarray[index+i] >> 8);
        bytearray.push(dataarray[index+i] & 0xff);
    }       
    var value =  String.fromCharCode.apply(null, bytearray);    
    var value2 = new String(value).trim();
    return value2;
}


function forcesetState(objectname, value, options)
//------------------------------------------------
// perform createState() only if variable does not yet exist, and perform the check via existsState() only once for each processing round
{   if (testCreateState == 0)
    {   if (!existsState(JavaInst + objectname)) { createState(objectname, value, options); }
        else                                            { setState(objectname, value); }
    } else
    {   setState(objectname, value);
    }
}  


function ConnectModbus()
//----------------------
// connects to modbus
 {
    console.log("Init connection to: " + ModBusHost +":" + ModBusPort);

    // set requests parameters and try to connect
    client.setTimeout (10000);
    client.connectTCP (ModBusHost, { port: ModBusPort })
        .then(function()
        {   console.log("Connected"); })
        .catch(function(e)
        {   console.log(e); });
}


// Functions to map registers into ioBreaker objects
function ProcessOptimizers(id)
//----------------------------
{
    forcesetState(SHI + id + ".OptimizerTotalNumber",     getU16(Buffer[id-1], 37200), {name: "", unit: ""});
    forcesetState(SHI + id + ".OptimizerOnlineNumber",    getU16(Buffer[id-1], 37201), {name: "", unit: ""});
    forcesetState(SHI + id + ".OptimizerFeatureData",     getU16(Buffer[id-1], 37202), {name: "", unit: ""});
}

function ProcessInverterPowerAdjustments(id)
//------------------------------------------
{
    forcesetState(SHI + id + ".ActiveAdjustement.ActiveAdjustementMode",     getU16(Buffer[id-1], 35300), {name: "", unit: ""});
    forcesetState(SHI + id + ".ActiveAdjustement.ActiveAdjustementValue",    getU32(Buffer[id-1], 35301), {name: "", unit: ""}); // Note: This might be an error in the manual. It says register 35302 with quantity 2, but on 35303 is already the next value.
    forcesetState(SHI + id + ".ActiveAdjustement.ActiveAdjustementCommand",  getU16(Buffer[id-1], 35303), {name: "", unit: ""});
    forcesetState(SHI + id + ".ActiveAdjustement.ReactiveAdjustementMode",   getU16(Buffer[id-1], 35304), {name: "", unit: ""});
    forcesetState(SHI + id + ".ActiveAdjustement.ReactiveAdjustementValue",  getU32(Buffer[id-1], 35305), {name: "", unit: ""});
    forcesetState(SHI + id + ".ActiveAdjustement.ReactiveAdjustementCommand",getU16(Buffer[id-1], 35307), {name: "", unit: ""});
    forcesetState(SHI + id + ".ActiveAdjustement.PowerMeterActivePower",     getI32(Buffer[id-1], 35313), {name: "", unit: ""});
}

function ProcessBattery(id)
//-------------------------
{
    // Battery registers 1-15 (Stack 1 related)
    if ( BatteryUnits[id-1][0] > 0)
    {
        forcesetState(SHI + id + ".Batterystack.1.RunningStatus",               getU16(Buffer[id-1], 37000), {name: "", unit: ""});
        forcesetState(SHI + id + ".Batterystack.1.ChargeAndDischargePower",     getI32(Buffer[id-1], 37001), {name: "Charge and Discharge Power", unit: "W"});
        forcesetState(SHI + id + ".Batterystack.1.BusVoltage",                  getU16(Buffer[id-1], 37003) / 10, {name: "Busvoltage", unit: "V"});
        forcesetState(SHI + id + ".Batterystack.1.BatterySOC",                  getU16(Buffer[id-1], 37004) / 10, {name: "Battery SOC", unit: "%"});
        forcesetState(SHI + id + ".Batterystack.1.WorkingMode",                 getU16(Buffer[id-1], 37006), {name: "Working Mode", unit: ""});
        forcesetState(SHI + id + ".Batterystack.1.RatedChargePower",            getU32(Buffer[id-1], 37007), {name: "", unit: "W"});
        forcesetState(SHI + id + ".Batterystack.1.RatedDischargePower",         getU32(Buffer[id-1], 37009), {name: "", unit: "W"});
        forcesetState(SHI + id + ".Batterystack.1.FaultID",                     getU16(Buffer[id-1], 37014), {name: "", unit: ""});
        forcesetState(SHI + id + ".Batterystack.1.CurrentDayChargeCapacity",    getU32(Buffer[id-1], 37015) / 100, {name: "", unit: "kWh"});
        forcesetState(SHI + id + ".Batterystack.1.CurrentDayDischargeCapacity", getU32(Buffer[id-1], 37017) / 100, {name: "", unit: "kWh"});
        forcesetState(SHI + id + ".Batterystack.1.BusCurrent",                  getI16(Buffer[id-1], 37021) / 10, {name: "Buscurrent", unit: "A"});
        forcesetState(SHI + id + ".Batterystack.1.BatteryTemperature",          getI16(Buffer[id-1], 37022) / 10, {name: "Battery Temperatue", unit: "°C"});
        forcesetState(SHI + id + ".Batterystack.1.RemainingChargeDischargeTime",getU16(Buffer[id-1], 37025), {name: "", unit: "mins"});
        //forcesetState(SHI + id + ".Batterystack.1.DCDCversion",                 getStr(Buffer[id-1], 37026, 10), {name: "", unit: ""});
        //forcesetState(SHI + id + ".Batterystack.1.BMSversion",                  getStr(Buffer[id-1], 37036, 10), {name: "", unit: ""});
    }
    // Battery registers 16+17 (Storage-related)
    forcesetState(SHI + id + ".Battery.MaximumChargePower",                     getU32(Buffer[id-1], 37046), {name: "", unit: "W"});
    forcesetState(SHI + id + ".Battery.MaximumDischargePower",                  getU32(Buffer[id-1], 37048), {name: "", unit: "W"});

    // Battery register 18-20 (Stack 1 related)
    if (BatteryUnits[id-1][0] > 0)
    {
        forcesetState(SHI + id + ".Batterystack.1.SN",                          getStr(Buffer[id-1], 37052, 10), {name: "Serialnumber", unit: ""});       
        forcesetState(SHI + id + ".Batterystack.1.TotalCharge",                 getU32(Buffer[id-1], 37066) / 100, {name: "", unit: "kWh"});
        forcesetState(SHI + id + ".Batterystack.1.TotalDischarge",              getU32(Buffer[id-1], 37068) / 100, {name: "", unit: "kWh"});
    }
    // Battery register 21-31 (Stack 2 related)
    if ( BatteryUnits[id-1][1] > 0)
    {
        forcesetState(SHI + id + ".Batterystack.2.SN",                          getStr(Buffer[id-1], 37700, 10), {name: "Serialnumber", unit: ""});        
        forcesetState(SHI + id + ".Batterystack.2.BatterySOC",                  getU16(Buffer[id-1], 37738) / 10, {name: "", unit: "%"});
        forcesetState(SHI + id + ".Batterystack.2.RunningStatus",               getU16(Buffer[id-1], 37741), {name: "", unit: ""});
        forcesetState(SHI + id + ".Batterystack.2.ChargeAndDischargePower",     getI32(Buffer[id-1], 37743), {name: "", unit: "W"});
        forcesetState(SHI + id + ".Batterystack.2.CurrentDayChargeCapacity",    getU32(Buffer[id-1], 37746) / 100, {name: "", unit: "kWh"});
        forcesetState(SHI + id + ".Batterystack.2.CurrentDayDischargeCapacity", getU32(Buffer[id-1], 37748) / 100, {name: "", unit: "kWh"});
        forcesetState(SHI + id + ".Batterystack.2.BusVoltage",                  getU16(Buffer[id-1], 37750) / 10, {name: "", unit: "V"});
        forcesetState(SHI + id + ".Batterystack.2.BusCurrent",                  getI16(Buffer[id-1], 37751) / 10, {name: "", unit: "A"});
        forcesetState(SHI + id + ".Batterystack.2.BatteryTemperature",          getI16(Buffer[id-1], 37752) / 10, {name: "", unit: "°C"});
        forcesetState(SHI + id + ".Batterystack.2.TotalCharge",                 getU32(Buffer[id-1], 37753) / 100, {name: "", unit: "kWh"});
        forcesetState(SHI + id + ".Batterystack.2.TotalDischarge",              getU32(Buffer[id-1], 37755) / 100, {name: "", unit: "kWh"});
    }
    // Battery register 32-41 (Storage related)
    forcesetState(SHI + id + ".Battery.RatedCapacity",                          getU32(Buffer[id-1], 37758) / 1,   {name: "", unit: "Wh"});
    forcesetState(SHI + id + ".Battery.SOC",                                    getU16(Buffer[id-1], 37760) / 10,  {name: "", unit: "%"});
    forcesetState(SHI + id + ".Battery.RunningStatus",                          getU16(Buffer[id-1], 37762) / 1,   {name: "", unit: ""});
    forcesetState(SHI + id + ".Battery.BusVoltage",                             getU16(Buffer[id-1], 37763) / 10,  {name: "", unit: "V"});
    forcesetState(SHI + id + ".Battery.BusCurrent",                             getI16(Buffer[id-1], 37764) / 10,  {name: "", unit: "A"});
    forcesetState(SHI + id + ".Battery.ChargeAndDischargePower",                getI32(Buffer[id-1], 37765) / 1,   {name: "", unit: "W"});
    forcesetState(SHI + id + ".Battery.TotalCharge",                            getU32(Buffer[id-1], 37780) / 100, {name: "", unit: "kWh"});
    forcesetState(SHI + id + ".Battery.TotalDischarge",                         getU32(Buffer[id-1], 37782) / 100, {name: "", unit: "kWh"});
    forcesetState(SHI + id + ".Battery.CurrentDayChargeCapacity",               getU32(Buffer[id-1], 37784) / 100, {name: "", unit: "kWh"});
    forcesetState(SHI + id + ".Battery.CurrentDayDischargeCapacity",            getU32(Buffer[id-1], 37786) / 100, {name: "Current DayDiscarge ", unit: "kWh"});

    forcesetState(SHI + id + ".Battery.ChargingCutoffCapacity",                 getU16(Buffer[id-1], 47081) / 10,  {name: "", unit: "%"});
    forcesetState(SHI + id + ".Battery.DischargeCutoffCapacity",                getU16(Buffer[id-1], 47082) / 10,  {name: "", unit: "%"});
    forcesetState(SHI + id + ".Battery.ForcedChargeDischargePeriod",            getU16(Buffer[id-1], 47083) / 1,   {name: "", unit: "mins"});
    forcesetState(SHI + id + ".Battery.WorkingModeSettings",                    getU16(Buffer[id-1], 47086) / 1,   {name: "", unit: ""});
    forcesetState(SHI + id + ".Battery.ChargeFromGridFunction",                 getU16(Buffer[id-1], 47087) / 1,   {name: "", unit: ""});
    forcesetState(SHI + id + ".Battery.GridChargeCutoffSOC",                    getU16(Buffer[id-1], 47088) / 10,  {name: "", unit: "%"});

    // Battery registers 42+43 (Battery stack related)   
    if (BatteryUnits[id-1][1] > 0)
    {
        forcesetState(SHI + id + ".Batterystack.2.SoftwareVersion",             getStr(Buffer[id-1], 37814, 8), {name: "Softwareversion", unit: ""});
    }
    
    if (BatteryUnits[id-1][0] > 0)
    {
        forcesetState(SHI + id + ".Batterystack.1.SoftwareVersion", getStr(Buffer[id-1], 37799, 8), {name: "Softwareversion", unit: ""});
    }

    // Registers 44 to 98: (Battery pack related)
    for(var i = 1; i <= 2; i++)
    {        
        if(BatteryUnits[id-1][i-1] >= 0)
        {            
            for(var j = 1; j <= BatteryUnits[id-1][i-1]; j++)
            {
                //[[38200, 38242, 38284] [38326, 38368, 38410]]; (+42 for each battery pack, +126 for each stack)
                forcesetState(SHI + id + ".Batterystack." + i + ".Battery" + j + ".SN",                     getStr(Buffer[id-1], 38200+(i-1)*126+(j-1)*42, 6), {name: "", unit: ""});
                forcesetState(SHI + id + ".Batterystack." + i + ".Battery" + j + ".FirmwareVersion",        getStr(Buffer[id-1], 38210+(i-1)*126+(j-1)*42, 8), {name: "", unit: ""});
                forcesetState(SHI + id + ".Batterystack." + i + ".Battery" + j + ".WorkingStatus",          getU16(Buffer[id-1], 38228+(i-1)*126+(j-1)*42), {name: "", unit: ""});
                forcesetState(SHI + id + ".Batterystack." + i + ".Battery" + j + ".BatterySOC",             getU16(Buffer[id-1], 38229+(i-1)*126+(j-1)*42) / 10, {name: "", unit: "%"});
                forcesetState(SHI + id + ".Batterystack." + i + ".Battery" + j + ".ChargeAndDischargePower",getI32(Buffer[id-1], 38233+(i-1)*126+(j-1)*42) / 1000, {name: "", unit: "kW"});
                forcesetState(SHI + id + ".Batterystack." + i + ".Battery" + j + ".Voltage",                getU16(Buffer[id-1], 38235+(i-1)*126+(j-1)*42) / 10, {name: "", unit: "V"});
                forcesetState(SHI + id + ".Batterystack." + i + ".Battery" + j + ".Current",                getI16(Buffer[id-1], 38236+(i-1)*126+(j-1)*42) / 10, {name: "", unit: "A"});
                forcesetState(SHI + id + ".Batterystack." + i + ".Battery" + j + ".TotalCharge",            getU32(Buffer[id-1], 38238+(i-1)*126+(j-1)*42) / 100, {name: "", unit: "kWh"});
                forcesetState(SHI + id + ".Batterystack." + i + ".Battery" + j + ".TotalDischarge",         getU32(Buffer[id-1], 38240+(i-1)*126+(j-1)*42) / 100, {name: "", unit: "kWh"});

                // [[38452, 38454, 38456][38458, 38460, 38462]] ( +2 for each pack, +6 for each stack)
                createState(SHI + id + ".Batterystack." + i + ".Battery" + j + ".MaxTemperature",           getI16(Buffer[id-1], 38452+(i-1)*6+(j-1)*2) / 10, {name: "", unit: "°C"});
                createState(SHI + id + ".Batterystack." + i + ".Battery" + j + ".MinTemperature",           getI16(Buffer[id-1], 38453+(i-1)*6+(j-1)*2) / 10, {name: "", unit: "°C"});
            }
        }        
    }

    // Battery registers 110-141 are not supported by this script yet!
}


function ProcessPowerMeterStatus()
//--------------------------------
{       
    forcesetState(SHM + "Status",                   getU16(Buffer[PowerMeterID], 37100), {name: "", unit: ""});
    forcesetState(SHM + "VoltageL1",                getI32(Buffer[PowerMeterID], 37101)  / 10, {name: "", unit: "V"});
    forcesetState(SHM + "VoltageL2",                getI32(Buffer[PowerMeterID], 37103)  / 10, {name: "", unit: "V"});
    forcesetState(SHM + "VoltageL3",                getI32(Buffer[PowerMeterID], 37105)  / 10, {name: "", unit: "V"});
    forcesetState(SHM + "CurrentL1",                getI32(Buffer[PowerMeterID], 37107)  / 100, {name: "", unit: "A"});
    forcesetState(SHM + "CurrentL2",                getI32(Buffer[PowerMeterID], 37109)  / 100, {name: "", unit: "A"});
    forcesetState(SHM + "CurrentL3",                getI32(Buffer[PowerMeterID], 37111) / 100, {name: "", unit: "A"});
    forcesetState(SHM + "ActivePower",              getI32(Buffer[PowerMeterID], 37113) / 1, {name: "", unit: "W"});
    forcesetState(SHM + "ReactivePower",            getI32(Buffer[PowerMeterID], 37115) / 1, {name: "", unit: "Var"});
    forcesetState(SHM + "PowerFactor",              getI16(Buffer[PowerMeterID], 37117) / 1000, {name: "", unit: ""});
    forcesetState(SHM + "GridFrequency",            getI16(Buffer[PowerMeterID], 37118) / 100, {name: "", unit: "Hz"});
    forcesetState(SHM + "PositiveActiveEnergy",     getI32(Buffer[PowerMeterID], 37119) / 100, {name: "", unit: "kWh"});
    forcesetState(SHM + "ReverseActiveEnergy",      getI32(Buffer[PowerMeterID], 37121) / 100, {name: "", unit: "kWh"});
    forcesetState(SHM + "AccumulatedReactivePower", getI32(Buffer[PowerMeterID], 37123) / 100, {name: "", unit: "kVarh"});
    //forcesetState(SHM + "MeterType",                getU16(Buffer[PowerMeterID], 37125), {name: "", unit: ""});
    forcesetState(SHM + "VoltageL1-L2",             getI32(Buffer[PowerMeterID], 37126) / 10, {name: "", unit: "V"});
    forcesetState(SHM + "VoltageL2-L3",             getI32(Buffer[PowerMeterID], 37128) / 10, {name: "", unit: "V"});
    forcesetState(SHM + "VoltageL3-L1",             getI32(Buffer[PowerMeterID], 37130) / 10, {name: "", unit: "V"});
    forcesetState(SHM + "ActivePowerL1",            getI32(Buffer[PowerMeterID], 37132) / 1, {name: "", unit: "W"});
    forcesetState(SHM + "ActivePowerL2",            getI32(Buffer[PowerMeterID], 37134) / 1, {name: "", unit: "W"});
    forcesetState(SHM + "ActivePowerL3",            getI32(Buffer[PowerMeterID], 37136) / 1, {name: "", unit: "W"});
    //forcesetState(SHM + "MeterModel",               getU16(Buffer[PowerMeterID], 37138), {name: "", unit: ""});
}

function ProcessInverterStatus(id)
//--------------------------------
{
    forcesetState(SHI + id + ".State1",                 getU16(Buffer[id-1], 32000), {name: "", unit: ""});
    forcesetState(SHI + id + ".State2",                 getU16(Buffer[id-1], 32001), {name: "", unit: ""});
    forcesetState(SHI + id + ".State3",                 getU16(Buffer[id-1], 32002), {name: "", unit: ""});
    forcesetState(SHI + id + ".Alarm1",                 getU16(Buffer[id-1], 32008), {name: "", unit: ""});
    forcesetState(SHI + id + ".Alarm2",                 getU16(Buffer[id-1], 32009), {name: "", unit: ""});
    forcesetState(SHI + id + ".Alarm3",                 getU16(Buffer[id-1], 32010), {name: "", unit: ""});
    forcesetState(SHI + id + ".String.1_Voltage",       getI16(Buffer[id-1], 32016) / 10  , {name: "", unit: "V"});
    forcesetState(SHI + id + ".String.1_Current",       getI16(Buffer[id-1], 32017) / 100 , {name: "", unit: "A"});
    //forcesetState(SHI + id + ".String.2_Voltage",     getI16(Buffer[id-1], 32018) / 10  , {name: "", unit: "V"});
    //forcesetState(SHI + id + ".String.2_Current",     getI16(Buffer[id-1], 32019) / 100 , {name: "", unit: "A"});
    forcesetState(SHI + id + ".InputPower",             getI32(Buffer[id-1], 32064) / 1000, {name: "", unit: "kW"});
    forcesetState(SHI + id + ".Grid.L1-L2_Voltage",     getU16(Buffer[id-1], 32066) / 10  , {name: "", unit: "V"});      
    forcesetState(SHI + id + ".Grid.L2-L3_Voltage",     getU16(Buffer[id-1], 32067) / 10  , {name: "", unit: "V"});
    forcesetState(SHI + id + ".Grid.L3-L1_Voltage",     getU16(Buffer[id-1], 32068) / 10  , {name: "", unit: "V"});
    forcesetState(SHI + id + ".Grid.L1_Voltage",        getU16(Buffer[id-1], 32069) / 10  , {name: "", unit: "V"});                              
    forcesetState(SHI + id + ".Grid.L2_Voltage",        getU16(Buffer[id-1], 32070) / 10  , {name: "", unit: "V"});                                                  
    forcesetState(SHI + id + ".Grid.L3_Voltage",        getU16(Buffer[id-1], 32071) / 10  , {name: "", unit: "V"});
    forcesetState(SHI + id + ".Grid.L1_Current",        getI32(Buffer[id-1], 32072) / 1000, {name: "", unit: "A"});
    forcesetState(SHI + id + ".Grid.L2_Current",        getI32(Buffer[id-1], 32074) / 1000, {name: "", unit: "A"});
    forcesetState(SHI + id + ".Grid.L3_Current",        getI32(Buffer[id-1], 32076) / 1000, {name: "", unit: "A"});
    forcesetState(SHI + id + ".PeakActivePowerDay",     getI32(Buffer[id-1], 32078) / 1000, {name: "", unit: "kW"});
    forcesetState(SHI + id + ".ActivePower",            getI32(Buffer[id-1], 32080) / 1000, {name: "", unit: "kW"});
    forcesetState(SHI + id + ".ReactivePower",          getI32(Buffer[id-1], 32082) / 1000, {name: "", unit: "kVar"});
    forcesetState(SHI + id + ".PowerFactor",            getI16(Buffer[id-1], 32084) / 1000, {name: "", unit: ""});
    forcesetState(SHI + id + ".GridFrequency",          getU16(Buffer[id-1], 32085) / 100 , {name: "", unit: "Hz"});
    forcesetState(SHI + id + ".Efficiency",             getU16(Buffer[id-1], 32086) / 100 , {name: "", unit: "%"});
    forcesetState(SHI + id + ".InternalTemperature",    getI16(Buffer[id-1], 32087) / 10  , {name: "", unit: "°C"});
    forcesetState(SHI + id + ".InsulationResistance",   getU16(Buffer[id-1], 32088) / 1000, {name: "", unit: "MOhm"});
    forcesetState(SHI + id + ".DeviceStatus",           getU16(Buffer[id-1], 32089), {name: "", unit: ""});
    forcesetState(SHI + id + ".FaultCode",              getU16(Buffer[id-1], 32090), {name: "", unit: ""});
    forcesetState(SHI + id + ".StartupTime",            getU32(Buffer[id-1], 32091), {name: "", unit: ""});
    forcesetState(SHI + id + ".ShutdownTime",           getU32(Buffer[id-1], 32093), {name: "", unit: ""});
    forcesetState(SHI + id + ".AccumulatedEnergyYield", getU32(Buffer[id-1], 32106) / 100, {name: "", unit: "kWh"});
    forcesetState(SHI + id + ".DailyEnergyYield",       getU32(Buffer[id-1], 32114) / 100, {name: "", unit: "kWh"});
}


function ProcessDeviceInfo(id)
//----------------------------
{      
    // Note: Manual says its quantitiy is 15, but that is the number (+1) of 8bit characters
    forcesetState(SHI + id + ".Model",                   getStr(Buffer[id-1], 30000, 8), {name: "", unit: ""}); 
    forcesetState(SHI + id + ".SN",                      getStr(Buffer[id-1], 30015, 6), {name: "", unit: ""});
    forcesetState(SHI + id + ".PN",                      getStr(Buffer[id-1], 30025, 6), {name: "", unit: ""});
    forcesetState(SHI + id + ".ModelID",                 getU16(Buffer[id-1], 30070), {name: "", unit: ""});
    forcesetState(SHI + id + ".PVStrings",               getU16(Buffer[id-1], 30071), {name: "", unit: ""});
    forcesetState(SHI + id + ".MPPTrackers",             getU16(Buffer[id-1], 30072), {name: "", unit: ""});
    forcesetState(SHI + id + ".MaxRatedPower",           getU32(Buffer[id-1], 30073) / 1000, {name: "", unit: "kW"});
    forcesetState(SHI + id + ".MaxActivePower",          getU32(Buffer[id-1], 30075) / 1000, {name: "", unit: "kW"});
    forcesetState(SHI + id + ".MaxApparentPower",        getU32(Buffer[id-1], 30077) / 1000, {name: "", unit: "kVA"});
    forcesetState(SHI + id + ".MaxReactivePowerToGrid",  getI32(Buffer[id-1], 30079) / 1000, {name: "", unit: "kVAr"});
    forcesetState(SHI + id + ".MaxReactivePowerFromGrid",getI32(Buffer[id-1], 30081) / 1000, {name: "", unit: "kVAr"});
}


function readRegisterSpace(id, address, length)
//---------------------------------------------
{
    client.setID(ModBusIDs[id-1]);
    client.readHoldingRegisters(address, length, function(err, data)
    {   
        if (err)
        {   
// this error handling does not work and/or is not required for my installation
//            if (err.modbusCode == null)
//            {   console.warn("Lost connection to client. Trying to reconnect...");
//                ConnectModbus();
//            } else             
            console.warn("Error received reading address " + address + " from id: " + ModBusIDs[id-1] + " with error: " + modbusErrorMessages[err.modbusCode]);            
        }
        else
        {   //console.debug("Read data from id/address " + ModBusIDs[id-1] + "/" + address + "\nData is: " + data.data);
            for (var i = 0; i < length; i++) Buffer[id-1][address + i - BufOffset] = data.data[i];
        }
    });
}


function ProcessData()
//--------------------
{
    //console.debug("Processing new data...");
    for ( var i = 1; i <= ModBusIDs.length; i++)
    {
        ProcessDeviceInfo(i);
        ProcessInverterStatus(i);
        ProcessBattery(i);
        //ProcessInverterPowerAdjustments(i);
        ProcessOptimizers(i); 
    }    
    ProcessPowerMeterStatus();

    // get SOC of first battery stack and combine to one string
    var BatOverview = "";
    for(var j = 1; j <= BatteryUnits[0][0]; j++)
    { 
        if (j > 1) BatOverview += ", ";
        BatOverview += getState(JavaInst + "Solarpower.Huawei.Inverter.1.Batterystack.1.Battery" + j + ".BatterySOC").val + "%";
    }
    setState(JavaInst + "Solarpower.Derived.BatteryOverview", BatOverview);

    // determine peak panel power
    var PanelPower = getState(JavaInst + "Solarpower.Huawei.Inverter.1.InputPower").val;
    var PanelMax = getState(JavaInst + "Solarpower.Derived.PeakPanelPower").val;
    if (PanelPower > PanelMax) setState(JavaInst + "Solarpower.Derived.PeakPanelPower", PanelPower);
    
    // determine power used by house
    setState(JavaInst + "Solarpower.Derived.HouseConsumption", getState(JavaInst + "Solarpower.Huawei.Inverter.1.ActivePower").val * 1000 -
        getState(JavaInst + "Solarpower.Huawei.Meter.ActivePower").val);

    // determine yield today
    setState(JavaInst + "Solarpower.Derived.YieldToday", getState(JavaInst + "Solarpower.Huawei.Inverter.1.DailyEnergyYield").val +
        getState(JavaInst + "Solarpower.Huawei.Inverter.1.Batterystack.1.CurrentDayChargeCapacity").val -
        getState(JavaInst + "Solarpower.Huawei.Inverter.1.Batterystack.1.CurrentDayDischargeCapacity").val)

    // determine if battery is loading
    setState(JavaInst + "Solarpower.Derived.IsBatteryLoading", getState(JavaInst + "Solarpower.Huawei.Inverter.1.Batterystack.1.ChargeAndDischargePower").val > 0 ? 0 : 1);

    // determine if power is imported or exported
    setState(JavaInst + "Solarpower.Derived.IsGridExporting", getState(JavaInst + "Solarpower.Huawei.Meter.ActivePower").val > 0 ? 1 : 0);

    // compute export and import today
    setState(JavaInst + "Solarpower.Derived.GridExportToday", getState(JavaInst + "Solarpower.Huawei.Meter.PositiveActiveEnergy").val - getState(JavaInst + "Solarpower.Derived.GridExportSum").val);
    setState(JavaInst + "Solarpower.Derived.GridImportToday", getState(JavaInst + "Solarpower.Huawei.Meter.ReverseActiveEnergy").val - getState(JavaInst + "Solarpower.Derived.GridImportSum").val);
    
    // compute consumption today
    setState(JavaInst + "Solarpower.Derived.ConsumptionSum",
        getState(JavaInst + "Solarpower.Huawei.Inverter.1.AccumulatedEnergyYield").val +
        getState(JavaInst + "Solarpower.Huawei.Meter.ReverseActiveEnergy").val -
        getState(JavaInst + "Solarpower.Huawei.Meter.PositiveActiveEnergy").val);
    setState(JavaInst + "Solarpower.Derived.ConsumptionToday", 
        getState(JavaInst + "Solarpower.Derived.ConsumptionSum").val -
        getState(JavaInst + "Solarpower.Derived.ConsumptionStart").val); 

    // convert working mode to string that can be displayed
    var wom = "";
    switch (getState(JavaInst + "Solarpower.Huawei.Inverter.1.Batterystack.1.WorkingMode").val)
    {
        case  0: wom = "none"; break;
        case  1: wom = "Forcible charge/discharge"; break;
        case  2: wom = "Time of Use(LG)"; break;
        case  3: wom = "Fixed charge/discharge"; break;
        case  4: wom = "Maximise self consumption"; break;
        case  5: wom = "Fully fed to grid"; break;
        case  6: wom = "Time of Use(LUNA2000)"; break;
        default: wom = "undefined";
    }
    setState(JavaInst + "Solarpower.Derived.WorkingMode", wom);
    
    testCreateState = 1;                // do not check on createState any more
}


setInterval(function()
// -------------------
// This is the main function triggering a  read via modbus-tcp every 5000 ms (see end of SetInterval)
// Processing of data is triggered as soon as one complete set of registers is copied
// with 5 seconds, new values are displyed every 50 seconds
{
    //console.debug("Triggering read of inverter " + currentinverter + " at address " + RegToRead[RegToReadPtr][0] + " with length " +  RegToRead[RegToReadPtr][1]);
    readRegisterSpace(currentinverter, RegToRead[RegToReadPtr][0], RegToRead[RegToReadPtr][1]);
    
    // determine if all or only fast registers should be read
    var CurLength = RegFast;
    if ((RegReadCnt % RegFastMod) == 0) CurLength = RegToRead.length

    RegToReadPtr++;               
    if (RegToReadPtr >= CurLength)
    {
        RegToReadPtr = 0;
        // go through all inverters, if there are several
        currentinverter++
        if (currentinverter > ModBusIDs.length)
        {
            currentinverter = 1;  
            ProcessData();
            //if (CurLength == RegFast) log("Processing done (FAST)!", "info"); else log("Processing done (SLOW)!", "info");
            RegReadCnt++;
        }
    }     
}, 5000);


// one minute before midnight - perform housekeeping actions
schedule("59 23 * * *", function ()
{   
    // reset peak power for next day
    setState(JavaInst + "Solarpower.Derived.PeakPanelPower", 0);
    // copy current export/import kWh - used to compute daily import/export in kWh
    setState(JavaInst + "Solarpower.Derived.GridExportSum", getState(JavaInst + "Solarpower.Huawei.Meter.PositiveActiveEnergy").val);
    setState(JavaInst + "Solarpower.Derived.GridImportSum", getState(JavaInst + "Solarpower.Huawei.Meter.ReverseActiveEnergy").val);
    // copy consumption Sum to Start for the next day
    setState(JavaInst + "Solarpower.Derived.ConsumptionStart", getState(JavaInst + "Solarpower.Derived.ConsumptionSum").val);
    // log important iformation to file
    SolarPowerLogging();
});


function SolarPowerLogging() 
//--------------------------
// write values of today in file
{
    // get 
    var log1 = getState(JavaInst + "Solarpower.Derived.YieldToday").val;
    var log2 = getState(JavaInst + "Solarpower.Derived.GridExportToday").val;
    var log3 = getState(JavaInst + "Solarpower.Derived.GridImportToday").val;
    var log4 = getState(JavaInst + "Solarpower.Derived.ConsumptionToday").val;

    // Zerlege Datum und Zeit in Variable
    var now =    new Date();
    var year =   now.getFullYear();
    var month =  addZero(now.getMonth() + 1);
    var day =    addZero(now.getDate());
    var currDate = day + '.' + month + '.' + year;
    var string = " ";

    // create string that is appended to the file
    string = currDate + ";" + log1.toFixed(3) + ";" + log2.toFixed(3) + ";" + log3.toFixed(3) + ";" + log4.toFixed(3) + "\n";
    fs.appendFileSync("/opt/iobroker/iobroker-data/SolarpowerLog.csv", string);   

    // erzeuge Log-Eintrag
    log("Solerpower log:" + string, "info"); 
}


function addZero(Num)
//-----------------
// if number <10 add zero values at the beginning of numbers
{
    if (Num < 10) Num = "0" + Num;
    return Num;
}
