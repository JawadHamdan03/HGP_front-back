CREATE DATABASE IF NOT EXISTS smart_warehouse
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE smart_warehouse;

-- Single admin user
CREATE TABLE admins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Physical cells in the rack (row/column) + Arduino mapping
CREATE TABLE cells (
    id INT AUTO_INCREMENT PRIMARY KEY,
    row_num INT NOT NULL,
    col_num INT NOT NULL,
    label VARCHAR(50) NOT NULL,
    UNIQUE (row_num, col_num)
);

-- Products
CREATE TABLE products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    sku VARCHAR(100) NULL,
    rfid_uid VARCHAR(100) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Product placement in cells
CREATE TABLE cell_products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cell_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    UNIQUE (cell_id),
    FOREIGN KEY (cell_id) REFERENCES cells(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- Operations for history and tracking what the arm/conveyor did
CREATE TABLE operations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    op_type ENUM('HOME','PICK_FROM_CONVEYOR','PLACE_IN_CELL','TAKE_FROM_CELL','GOTO_COLUMN','MANUAL_CMD') NOT NULL,
    product_id INT NULL,
    cell_id INT NULL,
    cmd VARCHAR(100) NOT NULL,
    status ENUM('PENDING','SENT_TO_ESP','DONE','ERROR') NOT NULL DEFAULT 'PENDING',
    error_message VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
    FOREIGN KEY (cell_id) REFERENCES cells(id) ON DELETE SET NULL
);

-- Optional: sensor events (LDR1, LDR2, RFID read)
CREATE TABLE sensor_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    source ENUM('LDR1','LDR2','RFID') NOT NULL,
    value VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed one admin (change the password hash in real system!)
INSERT INTO admins (username, password_hash)
VALUES ('admin', '$2y$10$exampleexampleexampleexampleexampleexampleex'); -- bcrypt placeholder

-- Seed some example cells (3 rows x 4 cols like your arm)
INSERT INTO cells (row_num, col_num, label) VALUES
(1,1,'R1C1'), (1,2,'R1C2'), (1,3,'R1C3'), (1,4,'R1C4'),
(2,1,'R2C1'), (2,2,'R2C2'), (2,3,'R2C3'), (2,4,'R2C4'),
(3,1,'R3C1'), (3,2,'R3C2'), (3,3,'R3C3'), (3,4,'R3C4');